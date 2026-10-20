import { boardCells, type BoardRound, type CellMark } from '@quiz/shared';
import type { BoardPlay, BoardState, GameState } from './game';
import { answerPoints } from './score';

/** Скільки гравець, чий хід, може бути відключеним, поки хід не пропущено. */
export const BOARD_AWAY_MS = 30_000;

/** Нове коло: гравці в порядку приєднання. */
export function initBoard(state: GameState): BoardState {
  return { circle: state.players.map((p) => p.id), done: 0, rolls: 0, awaySince: null };
}

/** Гравець, чий хід; лише на етапі вибору клітинки. */
export function chooserOf(state: GameState): string | null {
  if (state.phase !== 'board' || state.board === null) return null;
  return state.board.circle[state.board.done] ?? null;
}

/** Хід зараховано; коли коло вичерпано, перший гравець стає останнім і коло починається знову. */
export function advanceTurn(board: BoardState): BoardState {
  const done = board.done + 1;
  if (done < board.circle.length) return { ...board, done };
  const [first, ...rest] = board.circle;
  return { ...board, circle: first === undefined ? [] : [...rest, first], done: 0 };
}

/** Клітинка вже зіграна в поточному раунді. */
export function cellPlayed(state: GameState, cellId: string): boolean {
  return state.plays.some((play) => play.roundIndex === state.roundIndex && play.question.id === cellId);
}

/** Чи лишилася в поточному раунді незіграна клітинка. */
export function hasActiveCells(state: GameState): boolean {
  const round = state.quiz.rounds[state.roundIndex];
  if (round?.type !== 'board') return false;
  return boardCells(round).some(({ cell }) => !cellPlayed(state, cell.question.id));
}

export function cellMultiplier(mark: CellMark): 1 | 2 | 3 {
  return mark === 'x2' ? 2 : mark === 'x3' ? 3 : 1;
}

/** Етап вибору клітинки: без таймера запитання, awaySince за підключенням гравця, чий хід. */
export function enterBoard(state: GameState, now: number): GameState {
  const entered: GameState = { ...state, phase: 'board', startedAt: null, endsAt: null, remainingMs: null };
  const chooser = chooserOf(entered);
  const away = chooser !== null && state.players.some((p) => p.id === chooser && !p.connected);
  const board = entered.board ?? initBoard(entered);
  return { ...entered, board: { ...board, awaySince: away && !state.paused ? now : null } };
}

/** Бали за оцінку на полі; accuracy вже з урахуванням правил часткових балів. Бонусу за швидкість на полі немає. */
export function boardPoints(round: BoardRound, board: BoardPlay, accuracy: number): number {
  return answerPoints({
    points: board.price,
    accuracy,
    speed: 1,
    multiplier: round.rules.multiplier * board.multiplier,
    penalty: round.rules.penalty,
  });
}
