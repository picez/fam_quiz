import { useEffect, useRef } from 'react';
import { AWAY_MS, AWAY_REPORT_MAX_MS, type GameView } from '@quiz/shared';
import type { Send, SendResult } from './types';
import type { Status } from './useGame';

/** Пауза перед повтором звіту, на який сервер відповів too_soon (вікно частоти — секунда). */
export const AWAY_RETRY_MS = 1000;
/** Скільки чекати підтвердження: socket.io губить колбек підтвердження на розриві, тож без межі звіт завис би назавжди. */
export const AWAY_ACK_MS = 5000;
/** Як часто перевіряти фокус після виходу через blur (WebKit може не надіслати focus). */
export const AWAY_FOCUS_POLL_MS = 500;

/** Відповіді, після яких звіт уже не повторюється: прийнято або сервер його ніколи не прийме. */
const FINAL = new Set(['forbidden', 'invalid_payload', 'not_found', 'game_not_found']);

/**
 * Чи blur — вихід із гри (12e): у сторінки немає фокусу. Фокус у вкладеному iframe гри (відео YouTube) — не вихід:
 * document.hasFocus() батька тоді true.
 */
export function blurIsAway(hasFocus: boolean): boolean {
  return !hasFocus;
}

const cap = (ms: number) => Math.min(AWAY_REPORT_MAX_MS, Math.max(0, Math.round(ms)));

/** Надсилання з межею часу: без підтвердження за AWAY_ACK_MS — offline (звіт піде на наступному 'live'). */
function sendWithin(send: Send, payload: unknown): Promise<SendResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'offline' }), AWAY_ACK_MS);
    void send('player:away', payload).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      () => {
        clearTimeout(timer);
        resolve({ ok: false, error: 'offline' });
      },
    );
  });
}

/**
 * Антигугл (12e): стежить за visibilitychange і blur / focus на сторінці гравця й шле player:away.
 * Вихід — { away: true }; повернення — { away: false, ms } (за годинником телефона, не більше AWAY_REPORT_MAX_MS).
 * Без зв'язку звіт чекає; після перепідключення (status 'live') — звіт із sinceReturnMs (скільки минуло від останнього
 * повернення), а якщо сторінка досі прихована — { away: true } знову. Кілька виходів без зв'язку — один звіт: ms — сума
 * самих виходів (видимий час між ними не рахується). Значення рахуються в мить надсилання: буфер socket.io не
 * використовується (send без зв'язку одразу відповідає offline). too_soon — повтор за секунду.
 * Вихід через blur закінчується й першим дотиком чи клавішею, і фокусом, який перевіряється раз на AWAY_FOCUS_POLL_MS.
 * Вимкнено поза роллю player, у лобі й після кінця гри.
 */
export function useAwayWatch(send: Send, status: Status, view: GameView | null): void {
  const active = view !== null && view.role === 'player' && view.phase !== 'lobby' && view.phase !== 'finished';
  const sendRef = useRef(send);
  sendRef.current = send;
  const statusRef = useRef(status);
  statusRef.current = status;
  // Нове (пере)підключення: звіт, що чекав, або «досі поза грою». Без нагляду — нічого.
  const onLive = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) return;
    // out — зараз поза грою, hiddenAt — мить поточного виходу; pendingMs — сума недоставлених виходів, returnedAt — мить
    // останнього повернення; backs / leaves — лічильники (відповідь на старий звіт не стирає новіший); sentOut — «поза
    // грою» вже сказано на цьому зв'язку; byBlur — поточний вихід почався з blur.
    const state = {
      out: false,
      hiddenAt: 0,
      pendingMs: 0,
      returnedAt: 0,
      backs: 0,
      sentBacks: 0,
      leaves: 0,
      sentOut: false,
      byBlur: false,
    };
    let busy = false;
    let alive = true;
    // Епоха зв'язку: відповідь, що прийшла після перепідключення, вже нічого не важить.
    let epoch = 0;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let focusPoll: ReturnType<typeof setInterval> | null = null;

    const flush = () => {
      if (!alive || busy || statusRef.current !== 'live') return;
      const now = Date.now();
      let payload: { away: boolean; ms?: number; sinceReturnMs?: number };
      let raw = 0;
      const backs = state.backs;
      const leaves = state.leaves;
      if (state.backs !== state.sentBacks) {
        // Спершу недоставлене повернення, навіть якщо телефон уже знову поза грою: потім — { away: true }.
        raw = state.pendingMs;
        const since = cap(now - state.returnedAt);
        payload = { away: false, ms: cap(raw), ...(since > 0 ? { sinceReturnMs: since } : {}) };
      } else if (state.out && !state.sentOut) payload = { away: true };
      else return;
      const mine = epoch;
      busy = true;
      void sendWithin(sendRef.current, payload).then((result) => {
        if (!alive || mine !== epoch) return;
        busy = false;
        if (!result.ok && result.error === 'too_soon') {
          retryTimer ??= setTimeout(() => {
            retryTimer = null;
            flush();
          }, AWAY_RETRY_MS);
          return;
        }
        // offline / restarting: звіт лишається й піде на наступному 'live'.
        if (!result.ok && !FINAL.has(result.error)) return;
        if (payload.away) {
          if (state.leaves === leaves && state.out) state.sentOut = true;
        } else {
          state.pendingMs = Math.max(0, state.pendingMs - raw);
          state.sentBacks = backs;
        }
        flush();
      });
    };

    const stopBlurWatch = () => {
      if (blurTimer !== null) clearTimeout(blurTimer);
      blurTimer = null;
      if (focusPoll !== null) clearInterval(focusPoll);
      focusPoll = null;
      document.removeEventListener('pointerdown', onTouch, true);
      document.removeEventListener('keydown', onTouch, true);
    };
    const leave = (at: number, byBlur: boolean) => {
      if (blurTimer !== null) clearTimeout(blurTimer);
      blurTimer = null;
      if (state.out) return;
      state.out = true;
      state.hiddenAt = at;
      state.leaves += 1;
      state.sentOut = false;
      state.byBlur = byBlur;
      if (byBlur) {
        document.addEventListener('pointerdown', onTouch, true);
        document.addEventListener('keydown', onTouch, true);
        focusPoll = setInterval(() => {
          if (document.visibilityState !== 'hidden' && document.hasFocus()) back();
        }, AWAY_FOCUS_POLL_MS);
      }
      flush();
    };
    function back() {
      stopBlurWatch();
      if (!state.out) return;
      const now = Date.now();
      state.out = false;
      state.byBlur = false;
      state.pendingMs += Math.max(0, now - state.hiddenAt);
      state.returnedAt = now;
      state.backs += 1;
      flush();
    }
    function onTouch() {
      if (state.byBlur && document.visibilityState !== 'hidden') back();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave(Date.now(), false);
      else if (document.visibilityState === 'visible') back();
    };
    const onBlur = () => {
      if (blurTimer !== null || state.out) return;
      const blurAt = Date.now();
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (blurIsAway(document.hasFocus())) leave(blurAt, true);
      }, AWAY_MS.blurGrace);
    };
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') back();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    onLive.current = () => {
      epoch += 1;
      busy = false;
      state.sentOut = false;
      flush();
    };
    // Сторінку сховано ще до початку нагляду (лобі): вихід від цієї миті, сервер рахує від старту запитання.
    if (document.visibilityState === 'hidden') leave(Date.now(), false);

    return () => {
      // Нагляд скінчився (кінець гри, інша роль): незвітований вихід уже нічого не важить.
      alive = false;
      stopBlurWatch();
      if (retryTimer !== null) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      onLive.current = () => {};
    };
  }, [active]);

  // Лише перехід у 'live' (перепідключення); перший рендер — ні: стан на старті нагляду шле сам ефект вище.
  const prevStatus = useRef(status);
  useEffect(() => {
    if (status === 'live' && prevStatus.current !== 'live') onLive.current();
    prevStatus.current = status;
  }, [status]);
}
