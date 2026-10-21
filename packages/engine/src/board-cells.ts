import { DEFAULT_ANSWER_WINDOW, type BoardRound } from '@quiz/shared';
// З game.ts і blitz.ts лише типи: обидва викликають цей файл, цикл під час виконання не потрібен.
import type { BlitzRules } from './blitz';
import type { BoardPlay } from './game';

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
