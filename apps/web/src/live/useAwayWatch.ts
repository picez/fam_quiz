import { useEffect, useRef } from 'react';
import { AWAY_MS, AWAY_REPORT_MAX_MS, type GameView } from '@quiz/shared';
import type { Send } from './types';
import type { Status } from './useGame';

/** Пауза перед повтором звіту, на який сервер відповів too_soon (вікно частоти — секунда). */
export const AWAY_RETRY_MS = 1000;

/** Відповіді, після яких звіт уже не повторюється: прийнято або сервер його ніколи не прийме. */
const FINAL = new Set(['forbidden', 'invalid_payload', 'not_found', 'game_not_found']);

/** Чи blur — вихід із гри (12e): фокусу немає, і він не в iframe гри (відео YouTube). */
export function blurIsAway(hasFocus: boolean, activeTag: string | null): boolean {
  return !hasFocus && activeTag !== 'IFRAME';
}

const cap = (ms: number) => Math.min(AWAY_REPORT_MAX_MS, Math.max(0, Math.round(ms)));

/**
 * Антигугл (12e): стежить за visibilitychange і blur / focus на сторінці гравця й шле player:away.
 * Вихід — { away: true }; повернення — { away: false, ms } (за годинником телефона, не більше AWAY_REPORT_MAX_MS).
 * Без зв'язку звіт чекає; після перепідключення (status 'live') — звіт із sinceReturnMs (скільки минуло від повернення),
 * а якщо сторінка досі прихована — { away: true } знову. Значення рахуються в мить надсилання, не в мить виходу:
 * буфер socket.io не використовується (send без зв'язку одразу відповідає offline). too_soon — повтор за секунду.
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
    // hiddenAt — мить виходу (живе до доставленого звіту повернення); out — зараз поза грою; returnedAt — мить
    // повернення, звіт про яке ще не доставлено; sentOut — «поза грою» вже сказано на цьому зв'язку;
    // seq — номер зміни стану (відповідь на старий звіт не стирає новий).
    const state = { hiddenAt: null as number | null, out: false, returnedAt: null as number | null, sentOut: false, seq: 0 };
    let busy = false;
    let alive = true;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (!alive || busy || statusRef.current !== 'live') return;
      let payload: { away: boolean; ms?: number; sinceReturnMs?: number };
      if (state.out) {
        if (state.sentOut) return;
        payload = { away: true };
      } else if (state.hiddenAt !== null && state.returnedAt !== null) {
        const since = cap(Date.now() - state.returnedAt);
        payload = { away: false, ms: cap(state.returnedAt - state.hiddenAt), ...(since > 0 ? { sinceReturnMs: since } : {}) };
      } else return;
      const seq = state.seq;
      busy = true;
      void sendRef.current('player:away', payload).then((result) => {
        busy = false;
        if (!alive) return;
        if (!result.ok && result.error === 'too_soon') {
          retryTimer ??= setTimeout(() => {
            retryTimer = null;
            flush();
          }, AWAY_RETRY_MS);
          return;
        }
        // Поки звіт летів, телефон повернувся чи вийшов знову: шлемо найсвіжіший.
        if (seq !== state.seq) return flush();
        // offline / restarting: звіт лишається й піде на наступному 'live'.
        if (!result.ok && !FINAL.has(result.error)) return;
        if (state.out) state.sentOut = true;
        else state.hiddenAt = state.returnedAt = null;
      });
    };

    const stopBlur = () => {
      if (blurTimer !== null) clearTimeout(blurTimer);
      blurTimer = null;
    };
    const leave = () => {
      stopBlur();
      if (state.out) return;
      state.out = true;
      state.sentOut = false;
      state.seq += 1;
      // Повернення ще не доставлено, а телефон знову вийшов: звіт лишається від першого виходу.
      if (state.returnedAt === null) state.hiddenAt = Date.now();
      state.returnedAt = null;
      flush();
    };
    const back = () => {
      stopBlur();
      if (!state.out) return;
      state.out = false;
      state.seq += 1;
      state.returnedAt = Date.now();
      flush();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave();
      else if (document.visibilityState === 'visible') back();
    };
    const onBlur = () => {
      if (blurTimer !== null || state.out) return;
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (blurIsAway(document.hasFocus(), document.activeElement?.tagName ?? null)) leave();
      }, AWAY_MS.blurGrace);
    };
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') back();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    onLive.current = () => {
      state.sentOut = false;
      flush();
    };
    // Сторінку сховано ще до початку нагляду (лобі): вихід від цієї миті, сервер рахує від старту запитання.
    if (document.visibilityState === 'hidden') leave();

    return () => {
      // Нагляд скінчився (кінець гри, інша роль): незвітований вихід уже нічого не важить.
      alive = false;
      stopBlur();
      if (retryTimer !== null) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      onLive.current = () => {};
    };
  }, [active]);

  useEffect(() => {
    if (status === 'live') onLive.current();
  }, [status]);
}
