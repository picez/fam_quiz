import type { CalendarEvent, FriendChallenge, GameInvite, GameSummary } from '@quiz/shared';

/** Гра, що триває на цьому пристрої (як її повертає useRunningGame). */
export interface RunningGame {
  code: string;
  title: string;
  to: string;
}

/** Що головна пропонує першим (53; 78 — ще запрошення й виклик від друга). */
export type NextUp =
  | ({ kind: 'running' } & RunningGame)
  | { kind: 'saved'; game: GameSummary }
  | { kind: 'invite'; invite: GameInvite }
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'challenge'; challenge: FriendChallenge };

/** Відповіді джерел картки «Що далі»; null у списку — збій запиту, тобто «немає даних» лише для цього джерела. */
export interface NextUpSources {
  running: RunningGame | null;
  games: GameSummary[] | null;
  invites: GameInvite[] | null;
  events: CalendarEvent[] | null;
  /** Сервер віддає найновіші першими. */
  challenges: FriendChallenge[] | null;
}

/**
 * Порядок: жива гра на цьому пристрої → найновіша збережена, яку можна продовжити (не відкрита й не blocked) →
 * найсвіжіше запрошення в гру → найближча подія (planned чи open; моя або з підтвердженим запитом) →
 * найновіший виклик від друга → null.
 */
export function pickNextUp({ running, games, invites, events, challenges }: NextUpSources): NextUp | null {
  if (running !== null) return { kind: 'running', ...running };

  let saved: GameSummary | null = null;
  for (const game of games ?? []) {
    const info = game.saved;
    if (info === undefined || info.open || info.mode === 'blocked') continue;
    if (saved === null || Date.parse(info.savedAt) > Date.parse(saved.saved!.savedAt)) saved = game;
  }
  if (saved !== null) return { kind: 'saved', game: saved };

  let invite: GameInvite | null = null;
  for (const item of invites ?? []) if (invite === null || Date.parse(item.invitedAt) > Date.parse(invite.invitedAt)) invite = item;
  if (invite !== null) return { kind: 'invite', invite };

  let next: CalendarEvent | null = null;
  for (const event of events ?? []) {
    if (event.state !== 'planned' && event.state !== 'open') continue;
    if (!event.mine && event.myRequest !== 'approved') continue;
    if (next === null || Date.parse(event.startsAt) < Date.parse(next.startsAt)) next = event;
  }
  if (next !== null) return { kind: 'event', event: next };

  const challenge = challenges?.[0];
  return challenge === undefined ? null : { kind: 'challenge', challenge };
}
