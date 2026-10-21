import type { ErrorCode } from '@quiz/shared';
import type { GameState, Play, Result } from './game';

const fail = (error: ErrorCode): Result => ({ ok: false, error });

/** Крок кнопок ведучого «−15 с» / «+15 с». */
export const TIME_STEP_S = 15;
/** Після «−15 с» на таймері лишається не менше. */
export const MIN_REMAINING_MS = 5_000;
/** Після «+15 с» на таймері лишається не більше. */
export const MAX_REMAINING_MS = 120_000;

/** Повний час запитання з урахуванням змін ведучого. */
export function limitMsOf(play: Play): number {
  return play.question.timeLimit * 1000 + play.extraMs;
}

/** Залишок таймера поточного запитання; null — не етап question або таймера немає. */
export function remainingOf(state: GameState, now: number): number | null {
  if (state.phase !== 'question') return null;
  if (state.paused) return state.remainingMs;
  return state.endsAt === null ? null : Math.max(0, state.endsAt - now);
}

/** seconds — +15 або −15. */
export function adjustTime(state: GameState, seconds: number, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  const remaining = remainingOf(state, now);
  if (remaining === null) return fail('wrong_phase');
  const delta = seconds * 1000;
  let next: number;
  if (delta < 0) {
    if (remaining <= MIN_REMAINING_MS) return fail('time_limit');
    next = Math.max(MIN_REMAINING_MS, remaining + delta);
  } else {
    if (remaining >= MAX_REMAINING_MS) return fail('time_limit');
    next = Math.min(MAX_REMAINING_MS, remaining + delta);
  }
  const plays = state.plays.map((play, index) =>
    index === state.questionIndex ? { ...play, extraMs: play.extraMs + (next - remaining) } : play,
  );
  return { ok: true, state: state.paused ? { ...state, plays, remainingMs: next } : { ...state, plays, endsAt: now + next } };
}
