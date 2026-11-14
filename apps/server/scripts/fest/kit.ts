/**
 * Набір для «Великого святкового фестивалю» (сід `fest`): ті самі помічники, що й у «Великому шкільному марафоні» (mega/kit),
 * і контракт файлів тем. Кожен файл теми експортує IMAGES (ключ → «File:…» з Commons або стаття англійської Вікіпедії)
 * і функцію (photos) => слоти. id запитанням дає збирач (fest-quiz.ts).
 */
import type { DuelCategory, Question } from '@quiz/shared';
import type { MegaSlot } from '../mega/kit';

export * from '../mega/kit';

/** Слоти однієї теми фестивалю: скільки запитань куди йде. */
export type ThemeSlots = {
  /** Класичний раунд: 5 запитань (кіно — 6). */
  classic: Question[];
  /** Категорія поля: рівно 5 клітинок 100…500 за складністю + запасна категорії. */
  board: MegaSlot;
  /** Бліц: 3 твердження «правда чи ні». */
  blitz: Question[];
  /** «Мільйонер»: номер сходинки (1…12) → запитання single з 4 варіантами. */
  ladder: Record<number, Question>;
  /** Ставки: 1 запитання з cut(…, n). */
  bets: Question;
  /** Аукціон: 1 запитання з cut(…, n). */
  auction: Question;
  /** Запасне для бафу «Заміна запитання»: простий тип (single/boolean/text/numeric), лише текст. */
  spare: Question;
};

export type { DuelCategory };
