import type { CalendarEvent, GameSummary } from '@quiz/shared';

/** Гра, що триває на цьому пристрої (як її повертає useRunningGame). */
export interface RunningGame {
  code: string;
  title: string;
  to: string;
}

/** Що головна пропонує першим (53): жива гра, збережена гра чи найближча подія календаря. */
export type NextUp = ({ kind: 'running' } & RunningGame) | { kind: 'saved'; game: GameSummary } | { kind: 'event'; event: CalendarEvent };

/**
 * Порядок: жива гра на цьому пристрої → найновіша збережена, яку можна продовжити (не відкрита й не blocked) →
 * найближча подія (planned чи open; моя або з підтвердженим запитом) → null. null у списку — збій запиту, тобто «немає даних».
 */
export function pickNextUp(running: RunningGame | null, games: GameSummary[] | null, events: CalendarEvent[] | null): NextUp | null {
  if (running !== null) return { kind: 'running', ...running };

  let saved: GameSummary | null = null;
  for (const game of games ?? []) {
    const info = game.saved;
    if (info === undefined || info.open || info.mode === 'blocked') continue;
    if (saved === null || Date.parse(info.savedAt) > Date.parse(saved.saved!.savedAt)) saved = game;
  }
  if (saved !== null) return { kind: 'saved', game: saved };

  let next: CalendarEvent | null = null;
  for (const event of events ?? []) {
    if (event.state !== 'planned' && event.state !== 'open') continue;
    if (!event.mine && event.myRequest !== 'approved') continue;
    if (next === null || Date.parse(event.startsAt) < Date.parse(next.startsAt)) next = event;
  }
  return next === null ? null : { kind: 'event', event: next };
}
