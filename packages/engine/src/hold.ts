import type { Answer } from '@quiz/shared';
import { withPlay } from './blitz';
// З game.ts лише типи: game.ts сам викликає цей файл, цикл під час виконання не потрібен.
import type { GameState } from './game';

/** Відповідь одного гравця, що чекає на рішення ведучого. */
export interface Pending {
  playerId: string;
  answer: Answer;
}

/** Відповідь одного гравця, що чекає на рішення ведучого; null — немає. */
export function pendingOf(state: GameState): Pending | null {
  if (state.phase !== 'question') return null;
  const play = state.plays[state.questionIndex];
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  const board = play?.board;
  if (round?.type !== 'board' || round.answerMode !== 'phone' || board === undefined || board.answer === null) return null;
  return state.players.some((p) => p.id === board.chooserId) ? { playerId: board.chooserId, answer: board.answer } : null;
}

/** Годинник запитання: heldAt під час утримання, інакше now. */
export function clockOf(state: GameState, now: number): number {
  return state.heldAt ?? now;
}

/** heldAt = now, якщо ще не стоїть. */
export function holdAt(state: GameState, now: number): GameState {
  return state.heldAt !== null ? state : { ...state, heldAt: now };
}

/** Зсуває натискання черги бліцу: вікна відповіді й час натискань не включають паузу чи утримання. */
export function shiftQueue(state: GameState, shiftMs: number): GameState {
  const play = state.plays[state.questionIndex];
  if (play?.blitz === undefined || shiftMs === 0) return state;
  const queue = play.blitz.queue.map((e) => ({
    ...e,
    at: e.at + shiftMs,
    deadline: e.deadline === null ? null : e.deadline + shiftMs,
  }));
  return withPlay(state, { ...play, blitz: { ...play.blitz, queue } });
}

/** Знімає утримання: startedAt, endsAt і черга бліцу (at, deadline) зсуваються на now − heldAt; heldAt = null. */
export function thaw(state: GameState, now: number): GameState {
  if (state.heldAt === null) return state;
  const shiftMs = now - state.heldAt;
  const shift = (time: number | null) => (time === null ? null : time + shiftMs);
  return shiftQueue({ ...state, heldAt: null, startedAt: shift(state.startedAt), endsAt: shift(state.endsAt) }, shiftMs);
}

/** Утримання без відповіді, що чекає (гравця вилучили), знімається; на паузі — після продовження. */
export function releaseStaleHold(state: GameState, now: number): GameState {
  if (state.heldAt === null || state.paused || pendingOf(state) !== null) return state;
  return thaw(state, now);
}
