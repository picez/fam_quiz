import { useSyncExternalStore } from 'react';
import { INBOX_POLL_MS } from '@quiz/shared';
import { getInboxBadge } from '../api';

/** Ненавмисні перечитування (перехід, повернення на вкладку) не частіше за це. */
export const INBOX_BADGE_MIN_GAP_MS = 5_000;

/*
 * 70: одне спільне сховище лічильника «Вхідних» на вкладку (як useFeedBadge): меню й сторінка читають той самий стан,
 * запит один на опитування. Сокета рівня користувача в застосунку немає, тож — опитування, повернення на вкладку
 * і сигнал від service worker після показу push-сповіщення.
 */
let unread = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let againAfter = false;
let lastStarted = Number.NEGATIVE_INFINITY;
/** Росте при скиданні: відповіді старших запитів відкидаються. */
let generation = 0;

const emit = () => {
  for (const listener of listeners) listener();
};

/** Перечитати лічильник: запит у польоті перевикористовується; без force — пропуск, якщо попередній почався < 5 с тому. */
export function refreshInbox(force = false): Promise<void> {
  if (listeners.size === 0) return Promise.resolve();
  if (inFlight !== null) {
    if (force) againAfter = true;
    return inFlight;
  }
  if (!force && Date.now() - lastStarted < INBOX_BADGE_MIN_GAP_MS) return Promise.resolve();
  lastStarted = Date.now();
  const mine = generation;
  inFlight = (async () => getInboxBadge())()
    .then((result) => {
      if (mine !== generation || !result.ok) return;
      unread = result.unread;
      emit();
    })
    .catch(() => undefined)
    .finally(() => {
      if (mine !== generation) return;
      inFlight = null;
      if (againAfter) {
        againAfter = false;
        void refreshInbox(true);
      }
    });
  return inFlight;
}

/** Сторінка «Вхідних» щойно позначила прочитаним: нове число лягає в лічильник одразу, без запиту. */
export function setInboxUnread(count: number): void {
  // Запити, що вже летять, могли б принести старіше число — їхні відповіді відкидаються.
  generation += 1;
  inFlight = null;
  againAfter = false;
  if (unread === count) return;
  unread = count;
  emit();
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void refreshInbox();
};

/** Сигнал service worker: прийшло сповіщення, яке кладе щось у «Вхідні». */
const onWorkerMessage = (event: Event) => {
  const data = (event as MessageEvent).data as unknown;
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'quiz:inbox') void refreshInbox(true);
};

const worker = (): EventTarget | null => (typeof navigator !== 'undefined' && typeof navigator.serviceWorker === 'object' && navigator.serviceWorker !== null ? navigator.serviceWorker : null);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refreshInbox();
    }, INBOX_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    worker()?.addEventListener('message', onWorkerMessage);
    void refreshInbox();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisible);
    worker()?.removeEventListener('message', onWorkerMessage);
    // Нікого немає (вихід з акаунта тощо): наступний підписник почне з чистого.
    generation += 1;
    unread = 0;
    inFlight = null;
    againAfter = false;
    lastStarted = Number.NEGATIVE_INFINITY;
  };
}

const noSubscribe = () => () => {};
const snapshot = () => unread;
const zero = () => 0;

/** Скільки непрочитаного у «Вхідних»; вимкнено (гість) — 0 і жодних запитів. */
export function useInboxBadge(enabled: boolean): number {
  return useSyncExternalStore(enabled ? subscribe : noSubscribe, enabled ? snapshot : zero, zero);
}
