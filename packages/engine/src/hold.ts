import type { Answer } from '@quiz/shared';
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
  // У бліці й на бліц-клітинці чекає відповідь голови черги; усна голова без відповіді не чекає.
  if (play?.blitz !== undefined) {
    const head = play.blitz.queue[0];
    return head === undefined || head.answer === null ? null : { playerId: head.playerId, answer: head.answer };
  }
  const board = play?.board;
  if (round?.type !== 'board' || board === undefined || board.answerMode !== 'phone' || board.answer === null) return null;
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
  // Без withPlay: blitz.ts сам імпортує цей файл.
  const shifted = { ...play, blitz: { ...play.blitz, queue } };
  return { ...state, plays: state.plays.map((p, index) => (index === state.questionIndex ? shifted : p)) };
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
