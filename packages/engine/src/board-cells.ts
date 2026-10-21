import { DEFAULT_ANSWER_WINDOW, type BoardRound } from '@quiz/shared';
// З game.ts і blitz.ts лише типи: обидва викликають цей файл, цикл під час виконання не потрібен.
import type { BlitzRules } from './blitz';
import type { AnswerRecord, BoardPlay, GameState } from './game';

/** Свій правильний відповідач на бліц-клітинці отримує ціну стільки разів. */
export const CELL_OWN_BONUS = 2;

/**
 * Черга бліц-клітинки: з телефона вікно DEFAULT_ANSWER_WINDOW і перевірка раунду, усно без вікна, голову оцінює ведучий.
 * Спроб без обмежень; неправильна спроба коштує 0 (штраф раунду не діє).
 */
export function cellBlitzRules(round: BoardRound, board: BoardPlay): BlitzRules {
  const voice = board.answerMode === 'voice';
  return {
    answerWindow: voice ? null : DEFAULT_ANSWER_WINDOW,
    attempts: null,
    check: voice ? 'voice' : round.check,
    points: (playerId, correct) =>
      correct
        ? Math.round(
            board.price * (playerId === board.chooserId ? CELL_OWN_BONUS : 1) * board.multiplier * round.rules.multiplier,
          )
        : 0,
  };
}

/** Штраф «Мінус для всіх»: −round(price × board.multiplier × round.rules.multiplier). */
export function cellPenaltyPoints(round: BoardRound, board: BoardPlay): number {
  return -Math.round(board.price * board.multiplier * round.rules.multiplier);
}

/** Запис для гравця, що не відповів правильно й не мав спроб: лише носій штрафу. */
const NO_ANSWER: Omit<AnswerRecord, 'basePoints' | 'streakBonus' | 'points'> = {
  answer: null,
  timeMs: 0,
  accepted: false,
  accuracy: 0,
  grade: 'wrong',
  overridden: false,
};

/**
 * Для бліц-клітинки з penalty 'all': кожному гравцеві, крім автора правильної відповіді, додає штраф до запису
 * (або створює запис без відповіді). Інакше стан без змін. Викликається один раз, коли клітинку закриває lockNow.
 */
export function withCellPenalty(state: GameState): GameState {
  const play = state.plays[state.questionIndex];
  const board = play?.board;
  const round = play === undefined ? undefined : state.quiz.rounds[play.roundIndex];
  if (state.phase !== 'question' || board?.kind !== 'blitz' || board.penalty !== 'all' || round?.type !== 'board') return state;
  const penalty = cellPenaltyPoints(round, board);
  const winnerId = play.blitz?.attempts.find((attempt) => attempt.grade === 'correct')?.playerId;
  const answers = { ...play.answers };
  for (const player of state.players) {
    if (player.id === winnerId) continue;
    const record = Object.hasOwn(answers, player.id) ? answers[player.id] : undefined;
    answers[player.id] =
      record === undefined
        ? { ...NO_ANSWER, basePoints: penalty, streakBonus: 0, points: penalty }
        : { ...record, basePoints: record.basePoints + penalty, points: record.points + penalty };
  }
  return { ...state, plays: state.plays.map((p, index) => (index === state.questionIndex ? { ...play, answers } : p)) };
}
