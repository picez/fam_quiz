import { EDITOR_TIME_MAX_SEC } from '@quiz/shared';
import { useEffect } from 'react';
import { sendEditorTime } from '../api';

/** 71: як часто лічимо активний час. */
export const TICK_MS = 5_000;
/** 71: після останньої дії людини час ще лічиться хвилину. */
export const IDLE_MS = 60_000;
/** 71: порція надсилається, коли накопичилась хвилина. */
export const FLUSH_SEC = 60;
const TICK_SEC = TICK_MS / 1000;
/** Після невдалого надсилання — наступна спроба не раніше ніж за хвилину (тиків). */
const RETRY_TICKS = FLUSH_SEC / TICK_SEC;
const ACTIONS = ['keydown', 'pointerdown', 'input', 'wheel'] as const;

export type EditorTimeSend = (body: { seconds: number; start: boolean }, keepalive: boolean) => Promise<boolean>;

/**
 * 71: лічильник активного часу в редакторі — без React. Кожні 5 с: вкладка видима й остання дія не давніше 60 с → +5 с.
 * Хвилина — порція на сервер; сховали вкладку, пішли зі сторінки чи зупинили — залишок одразу (keepalive).
 * Невдала порція не губиться: секунди лишаються до наступної (не більше EDITOR_TIME_MAX_SEC, надлишок відкидаємо).
 */
export function startEditorTime(send: EditorTimeSend): () => void {
  let lastAction = Date.now();
  let pending = 0;
  let inFlight = 0;
  let started = false;
  let cooldown = 0;

  const flush = (keepalive: boolean) => {
    // Звичайна порція чекає попередню; залишок при виході йде одразу.
    if (pending <= 0 || (inFlight > 0 && !keepalive)) return;
    const seconds = Math.min(pending, EDITOR_TIME_MAX_SEC);
    const start = !started;
    pending -= seconds;
    inFlight += seconds;
    started = true;
    void send({ seconds, start }, keepalive)
      .catch(() => false)
      .then((ok) => {
        inFlight -= seconds;
        if (ok) return;
        if (start) started = false;
        pending = Math.min(EDITOR_TIME_MAX_SEC, pending + seconds);
        cooldown = RETRY_TICKS;
      });
  };

  const tick = () => {
    if (cooldown > 0) cooldown -= 1;
    if (document.visibilityState === 'visible' && Date.now() - lastAction <= IDLE_MS) {
      pending = Math.min(EDITOR_TIME_MAX_SEC, pending + TICK_SEC);
    }
    if (pending >= FLUSH_SEC && cooldown === 0) flush(false);
  };
  const onAction = () => {
    lastAction = Date.now();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush(true);
  };
  const onPageHide = () => flush(true);

  const timer = window.setInterval(tick, TICK_MS);
  const options = { passive: true, capture: true } as const;
  for (const type of ACTIONS) document.addEventListener(type, onAction, options);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    window.clearInterval(timer);
    for (const type of ACTIONS) document.removeEventListener(type, onAction, options);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    flush(true);
  };
}

/** 71: лічильник на сторінці редактора; лише для акаунта, що вже увійшов. */
export function useEditorTime(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    return startEditorTime(sendEditorTime);
  }, [enabled]);
}
