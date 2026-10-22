import { boardCells, type BoardRound, type CellMark, type Phase } from '@quiz/shared';
import { dicePending } from './board-dice';
import type { BoardPlay, BoardState, GameState } from './game';
import { answerPoints } from './score';

/** Скільки гравець, чий хід, може бути відключеним, поки хід не пропущено. */
export const BOARD_AWAY_MS = 30_000;

/** Новий раунд поля: гравці в порядку приєднання, перше коло, без кубиків. */
export function initBoard(state: GameState): BoardState {
  return { circle: state.players.map((p) => p.id), done: 0, circleNo: 1, dice: null, awaySince: null };
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
  return { ...board, circle: first === undefined ? [] : [...rest, first], done: 0, circleNo: board.circleNo + 1 };
}

/** Гравця вилучено: коло скорочується, ходи, що вже відбулися, зберігаються. */
export function dropFromCircle(board: BoardState, playerId: string): BoardState {
  const index = board.circle.indexOf(playerId);
  if (index === -1) return board;
  const circle = board.circle.filter((id) => id !== playerId);
  const done = index < board.done ? board.done - 1 : board.done;
  if (circle.length === 0 || done < circle.length) return { ...board, circle, done };
  const [first, ...rest] = circle;
  return { ...board, circle: [...rest, first], done: 0, circleNo: board.circleNo + 1 };
}

export interface ScheduleCircle {
  number: number;
  order: string[];
  done: number;
}

/** Етапи, де клітинку вже вибрано й хід зсунуто: розклад відступає до того, хто вибрав. */
const PICKED_PHASES: Phase[] = ['question', 'locked', 'reveal', 'leaderboard'];

/** Перший гравець стає останнім, як в advanceTurn. */
const rotate = (order: string[]) => (order.length === 0 ? order : [...order.slice(1), order[0]]);

/** Розклад кіл від поточної позиції; [] без гравців або поки тур кубиків триває. */
export function turnSchedule(state: GameState): { circles: ScheduleCircle[]; repeats: boolean } {
  const board = state.board;
  const n = board?.circle.length ?? 0;
  if (board === null || n === 0 || dicePending(board)) return { circles: [], repeats: false };
  let { circle, done, circleNo } = board;
  const stepBack = PICKED_PHASES.includes(state.phase);
  if (stepBack) {
    if (done > 0) done -= 1;
    else {
      circle = [circle[n - 1], ...circle.slice(0, n - 1)];
      done = n - 1;
      circleNo = Math.max(1, circleNo - 1);
    }
  }
  const left = unplayedCells(state) - (n - done - (stepBack ? 1 : 0));
  const needed = 1 + Math.max(0, Math.ceil(left / n));
  const shown = Math.min(needed, n);
  const circles: ScheduleCircle[] = [{ number: circleNo, order: circle, done }];
  for (let i = 1; i < shown; i++) {
    circles.push({ number: circleNo + i, order: rotate(circles[i - 1].order), done: 0 });
  }
  return { circles, repeats: needed > shown };
}

/** Скільки клітинок поточного раунду ще не зіграно. */
function unplayedCells(state: GameState): number {
  const round = state.quiz.rounds[state.roundIndex];
  if (round?.type !== 'board') return 0;
  return boardCells(round).filter(({ cell }) => !cellPlayed(state, cell.question.id)).length;
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
