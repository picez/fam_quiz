import { cellAnswerMode, findCell, questionPrice, type Answer } from '@quiz/shared';
import { advanceTurn, cellMultiplier, cellPlayed, chooserOf, enterBoard } from './board-turns';
import { fail, ok, openQuestion, withCurrentPlay, type GameState, type Result, type Rng } from './game';
import { questionFor } from './buffs';

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
  // Ручний порядок скасовує кубики.
  return ok({ ...state, board: { ...state.board, circle: [...playerIds], done: 0, circleNo: 1, dice: null } });
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
  if (round.type !== 'board' || found === undefined) return fail('not_found');
  if (cellPlayed(state, cellId)) return fail('cell_closed');
  const { question } = found.cell;
  const turned = { ...state, board: { ...advanceTurn(state.board), awaySince: null } };
  return ok(
    openQuestion(turned, question, now, rng, {
      cellId,
      chooserId: chooser,
      // Для сортування — найбільша можлива сума; бали все одно рахуються за відсортовані слова.
      price: questionPrice(question),
      multiplier: cellMultiplier(found.cell.mark),
      kind: found.cell.kind,
      answerMode: cellAnswerMode(round, found.cell),
      penalty: found.cell.penalty,
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

/**
 * Ведучий позначає варіант, названий уголос: звичайна усна клітинка, single/multi/boolean, етапи question і locked.
 * null або multi без варіантів знімає позначку. Балів і записів не змінює.
 */
export function nameAnswer(state: GameState, answer: Answer | null): Result {
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  if (board === undefined || (state.phase !== 'question' && state.phase !== 'locked')) return fail('wrong_phase');
  if (board.kind === 'blitz' || board.answerMode !== 'voice') return fail('wrong_phase');
  // Після заміни вибравший відповідає на запасне — ведучий позначає варіант запасного.
  const question = questionFor(state, play, board.chooserId);
  if (answer === null || (answer.type === 'multi' && answer.optionIds.length === 0)) {
    const { named: _cleared, ...rest } = board;
    return ok(withCurrentPlay(state, { ...play, board: rest }));
  }
  if (answer.type !== question.type) return fail('type_mismatch');
  if (question.type === 'single' || question.type === 'multi') {
    const known = new Set(question.options.map((option) => option.id));
    const picked = answer.type === 'single' ? [answer.optionId] : answer.type === 'multi' ? answer.optionIds : [];
    if (!picked.every((id) => known.has(id))) return fail('not_found');
  } else if (question.type !== 'boolean') return fail('type_mismatch');
  return ok(withCurrentPlay(state, { ...play, board: { ...board, named: answer } }));
}
