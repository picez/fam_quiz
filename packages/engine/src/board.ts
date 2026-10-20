import { findCell } from '@quiz/shared';
import { advanceTurn, cellMultiplier, cellPlayed, chooserOf, enterBoard } from './board-turns';
import { fail, ok, openQuestion, shuffle, type GameState, type Result, type Rng } from './game';

/** Порядок гравців можна міняти лише на заставці раунду поля. */
function inBoardIntro(state: GameState): boolean {
  return state.phase === 'intro' && state.board !== null;
}

export function setOrder(state: GameState, playerIds: string[]): Result {
  if (!inBoardIntro(state) || state.board === null) return fail('wrong_phase');
  const known = new Set(state.players.map((p) => p.id));
  const valid =
    playerIds.length === known.size && new Set(playerIds).size === playerIds.length && playerIds.every((id) => known.has(id));
  if (!valid) return fail('not_found');
  return ok({ ...state, board: { ...state.board, circle: [...playerIds], done: 0 } });
}

export function rollOrder(state: GameState, rng: Rng): Result {
  if (!inBoardIntro(state) || state.board === null) return fail('wrong_phase');
  const circle = shuffle(
    state.players.map((p) => p.id),
    rng,
  );
  return ok({ ...state, board: { ...state.board, circle, done: 0, rolls: state.board.rolls + 1 } });
}

/** by — id гравця або null, коли вибирає ведучий. */
export function pickCell(state: GameState, by: string | null, cellId: string, now: number, rng: Rng): Result {
  if (state.phase !== 'board' || state.board === null) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const chooser = chooserOf(state);
  if (chooser === null) return fail('no_players');
  if (by !== null && by !== chooser) return fail('not_your_turn');
  const round = state.quiz.rounds[state.roundIndex];
  const found = round.type === 'board' ? findCell(round, cellId) : undefined;
  if (found === undefined) return fail('not_found');
  if (cellPlayed(state, cellId)) return fail('cell_closed');
  const { question } = found.cell;
  const turned = { ...state, board: { ...advanceTurn(state.board), awaySince: null } };
  return ok(
    openQuestion(turned, question, now, rng, {
      cellId,
      chooserId: chooser,
      price: question.points,
      multiplier: cellMultiplier(found.cell.mark),
      answer: null,
    }),
  );
}

/** Ведучий пропускає хід гравця, який вибирає клітинку. */
export function skipTurn(state: GameState, now: number): Result {
  if (state.phase !== 'board' || state.board === null) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  return ok(enterBoard({ ...state, board: advanceTurn(state.board) }, now));
}
