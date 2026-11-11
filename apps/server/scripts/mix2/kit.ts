/**
 * Набір для «Сім доріг ІІ» (сід `mix2`): помічники запитань і контракт файлів тем.
 * Кожен файл теми експортує об'єкт слотів; id запитанням дає збирач (mix2-quiz.ts), тож у файлах тем id не потрібні.
 */
import { jigsawGrid, jigsawTabs, type JigsawAspect, type Question } from '@quiz/shared';
import { blank, type Cell } from '../mix-quiz';

export { bool, cell, clues, duelCategory, duelQ, match, multi, numeric, order, pin, single, slider, sort, textQ } from '../demo-quiz';
export { blank, crossword, cut, drawing, ladder, letters, list, moreless, sudoku, yt, type Cell } from '../mix-quiz';
export { PIN_PLACES } from '../pin-places';

/**
 * Пазл: photo — адреса фото на сайті (/uploads/…), яку збирач передає через photos(key);
 * pieces — бажана кількість шматочків (6–36), сітку виводить jigsawGrid за пропорцією.
 */
export const jigsaw = (text: string, photo: string, aspect: JigsawAspect, pieces: number, points: number, time = 150, preview = true, seed = 7): Question => {
  const { rows, cols } = jigsawGrid(pieces, aspect);
  return {
    ...blank(text, points, time),
    type: 'jigsaw',
    photo,
    aspect,
    focus: { x: 0.5, y: 0.5 },
    rows,
    cols,
    seed,
    tabs: jigsawTabs(rows, cols, seed),
    preview,
  };
};

/** Клітинки однієї категорії поля: рівно 6, ціни 100, 200, 300, 400, 500, 600 (points = ціна), плюс запасна (ціна 200–300). */
export type BoardSlot = { cells: Cell[]; spare: Question };

/** Фото для пазлів: ключ → адреса на сайті. */
export type Photos = (key: string) => string;
