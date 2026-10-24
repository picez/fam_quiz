import { answerWindowMs, type ErrorCode, type Question } from '@quiz/shared';
import type { GameState, Play, Result } from './game';

const fail = (error: ErrorCode): Result => ({ ok: false, error });

/** Крок кнопок ведучого «−15 с» / «+15 с». */
export const TIME_STEP_S = 15;
/** Після «−15 с» на таймері лишається не менше. */
export const MIN_REMAINING_MS = 5_000;
/** Після «+15 с» на таймері лишається не більше. */
export const MAX_REMAINING_MS = 120_000;

/** Чи має запитання таймер: запитання з відео його не має. */
export function isTimed(question: Question): boolean {
  // Запитання без поля video (сирий рядок із сховища) — без відео.
  return question.video == null;
}

/** Повний час запитання (з довшим фрагментом аудіо) з урахуванням змін ведучого; null — без таймера. */
export function limitMsOf(play: Play): number | null {
  return isTimed(play.question) ? answerWindowMs(play.question) + play.extraMs : null;
}

/** Чи сплив час запитання на мить clock: без startedAt — так; без таймера — ніколи; інакше clock > endsAt (endsAt null — так). */
export function timeOver(state: GameState, play: Play, clock: number): boolean {
  if (state.startedAt === null) return true;
  if (!isTimed(play.question)) return false;
  return state.endsAt === null || clock > state.endsAt;
}

/** Залишок таймера поточного запитання; null — не етап question або таймера немає. */
export function remainingOf(state: GameState, now: number): number | null {
  if (state.phase !== 'question') return null;
  // Під час утримання годинник стоїть, також на паузі.
  if (state.heldAt !== null) return state.endsAt === null ? null : state.endsAt - state.heldAt;
  if (state.paused) return state.remainingMs;
  return state.endsAt === null ? null : Math.max(0, state.endsAt - now);
}

/** seconds — +15 або −15. */
export function adjustTime(state: GameState, seconds: number, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  // Під час заставки залишок і новий кінець рахуються від старту запитання.
  const clock = Math.max(now, state.startedAt ?? now);
  const remaining = remainingOf(state, clock);
  if (remaining === null) return fail('wrong_phase');
  const delta = seconds * 1000;
  // Спільний час сплив, а хтось ще в додатковому: «+15 с» додається лише до його залишку, решта лишаються закриті.
  if (remaining === 0 && delta > 0) {
    const extended = extendOvertime(state, delta, clock);
    if (extended === 'time_limit') return fail('time_limit');
    if (extended !== null) return { ok: true, state: extended };
  }
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
  if (state.heldAt !== null) return { ok: true, state: { ...state, plays, endsAt: state.heldAt + next } };
  return { ok: true, state: state.paused ? { ...state, plays, remainingMs: next } : { ...state, plays, endsAt: clock + next } };
}

/**
 * «+15 с» після спільного кінця: кожен гравець без запису, у кого лишився додатковий час, отримує ще delta
 * (особистий залишок не більше MAX_REMAINING_MS). null — у додатковому часі нікого немає; time_limit — усім уже максимум.
 */
function extendOvertime(state: GameState, delta: number, now: number): GameState | 'time_limit' | null {
  const play = state.plays[state.questionIndex];
  if (play?.overtime === undefined) return null;
  // На паузі overtime уже зменшено на витрачене (trimOvertime), endsAt немає.
  const clock = state.heldAt ?? now;
  const spent = state.endsAt === null ? 0 : Math.max(0, clock - state.endsAt);
  const waiting = Object.entries(play.overtime).filter(
    ([id, ms]) => ms > spent && state.players.some((p) => p.id === id) && !Object.hasOwn(play.answers, id),
  );
  if (waiting.length === 0) return null;
  if (waiting.every(([, ms]) => ms - spent >= MAX_REMAINING_MS)) return 'time_limit';
  const overtime = { ...play.overtime };
  for (const [id, ms] of waiting) overtime[id] = Math.min(spent + MAX_REMAINING_MS, ms + delta);
  const plays = state.plays.map((p, index) => (index === state.questionIndex ? { ...p, overtime } : p));
  return { ...state, plays };
}

/** Додатковий час гравця понад спільний кінець, мс; 0 — немає. */
export function overtimeOf(play: Play, playerId: string): number {
  const overtime = play.overtime;
  return overtime !== undefined && Object.hasOwn(overtime, playerId) ? overtime[playerId] : 0;
}

/** Особистий кінець: endsAt + overtimeOf; null — немає endsAt (пауза, без таймера, поза question). */
export function deadlineOf(state: GameState, play: Play, playerId: string): number | null {
  return state.endsAt === null ? null : state.endsAt + overtimeOf(play, playerId);
}

/** Як timeOver, але з особистим кінцем гравця. */
export function timeOverFor(state: GameState, play: Play, playerId: string, clock: number): boolean {
  if (state.startedAt === null) return true;
  if (!isTimed(play.question)) return false;
  const deadline = deadlineOf(state, play, playerId);
  return deadline === null || clock > deadline;
}

/** Коли запитання закривається за часом: найпізніше з endsAt і особистих кінців гравців у грі без запису; null — немає endsAt. */
export function closesAt(state: GameState): number | null {
  const play = state.plays[state.questionIndex];
  const { endsAt } = state;
  if (endsAt === null || play === undefined) return null;
  // Хто вже відповів, на себе не чекає; вилучений гравець з overtime зникає разом із собою.
  const waiting = state.players.filter((p) => !Object.hasOwn(play.answers, p.id));
  return Math.max(endsAt, ...waiting.map((p) => endsAt + overtimeOf(play, p.id)));
}

/** Записує гравцю додатковий час на поточне запитання (більший із наявного й ms). */
export function grantOvertime(state: GameState, playerId: string, ms: number): GameState {
  const plays = state.plays.map((play, index) =>
    index === state.questionIndex ? { ...play, overtime: { ...play.overtime, [playerId]: Math.max(overtimeOf(play, playerId), ms) } } : play,
  );
  return { ...state, plays };
}

/** Пауза посеред додаткового часу: кожен overtime поточного запитання зменшується на max(0, now − endsAt), не нижче 0. */
export function trimOvertime(state: GameState, now: number): GameState {
  const play = state.plays[state.questionIndex];
  if (state.endsAt === null || play?.overtime === undefined) return state;
  // Час понад спільний кінець уже витрачено: продовження його не повертає.
  const spent = Math.max(0, now - state.endsAt);
  if (spent === 0) return state;
  const overtime = Object.fromEntries(Object.entries(play.overtime).map(([id, ms]) => [id, Math.max(0, ms - spent)]));
  const plays = state.plays.map((p, index) => (index === state.questionIndex ? { ...p, overtime } : p));
  return { ...state, plays };
}
