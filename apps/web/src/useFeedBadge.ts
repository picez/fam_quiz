import { useSyncExternalStore } from 'react';
import { FEED_POLL_MS, type FeedBadge } from '@quiz/shared';
import { getFeedBadge } from './api';

/** Подія вікна після announceFeedSeen (для тих, хто хоче знати, що сторінка позначила переглянуте). */
export const FEED_CHANGED = 'quiz:feed-changed';
/** Ненавмисні перечитування (опитування, повернення на вкладку) не частіше за це. */
export const FEED_BADGE_MIN_GAP_MS = 5_000;

const ZERO: FeedBadge = { events: 0, requests: 0, decisions: 0 };

/*
 * Одне спільне сховище бейджа на всю вкладку: меню, стрічка й календар читають той самий стан,
 * тож запит один на опитування, а не по одному на кожен хук (бейдж і стрічка ділять ліміт `feed`).
 */
let state: FeedBadge = ZERO;
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

/** Перечитати бейдж: запит у польоті перевикористовується; без force — пропуск, якщо попередній почався < 5 с тому. */
function refresh(force = false): Promise<void> {
  if (inFlight !== null) {
    if (force) againAfter = true;
    return inFlight;
  }
  if (!force && Date.now() - lastStarted < FEED_BADGE_MIN_GAP_MS) return Promise.resolve();
  lastStarted = Date.now();
  const mine = generation;
  inFlight = getFeedBadge()
    .then((result) => {
      if (mine !== generation || !result.ok) return;
      state = { events: result.events, requests: result.requests, decisions: result.decisions };
      emit();
    })
    .catch(() => undefined)
    .finally(() => {
      if (mine !== generation) return;
      inFlight = null;
      if (againAfter) {
        againAfter = false;
        void refresh(true);
      }
    });
  return inFlight;
}

const onVisible = () => {
  if (document.visibilityState === 'visible') void refresh();
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, FEED_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    void refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisible);
    // Нікого немає (вихід з акаунта тощо): наступний підписник почне з чистого.
    generation += 1;
    state = ZERO;
    inFlight = null;
    againAfter = false;
    lastStarted = Number.NEGATIVE_INFINITY;
  };
}

const noSubscribe = () => () => {};
const snapshot = () => state;
const zero = () => ZERO;

/**
 * Сторінка щойно позначила переглянуте: patch (стрічка — {events: 0}, календар — {decisions: 0}) одразу
 * лягає в бейдж, далі одне примусове перечитування (злите з тим, що вже в польоті).
 */
export function announceFeedSeen(patch?: Partial<FeedBadge>): void {
  if (patch !== undefined && listeners.size > 0) {
    state = { ...state, ...patch };
    emit();
  }
  if (listeners.size > 0) void refresh(true);
  window.dispatchEvent(new Event(FEED_CHANGED));
}

/** Поточний бейдж без підписки (для рішень у обробниках). */
export function feedBadgeNow(): FeedBadge {
  return state;
}

/**
 * Бейдж стрічки зі спільного сховища: запит при першому підписнику, кожні FEED_POLL_MS при видимій вкладці,
 * на visibilitychange (не частіше 5 с) і після announceFeedSeen. Вимкнено чи ще невідомо — нулі. Помилка лишає попереднє значення.
 */
export function useFeedBadge(enabled: boolean): FeedBadge {
  return useSyncExternalStore(enabled ? subscribe : noSubscribe, enabled ? snapshot : zero, zero);
}
