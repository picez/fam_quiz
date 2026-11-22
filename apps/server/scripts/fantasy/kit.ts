/**
 * Набір для «Гоґвортсу й Середзем’я» (сід `fantasy`): помічники запитань і контракт файлів тем.
 * id запитанням дає збирач (fantasy-quiz.ts), тож у файлах тем id не потрібні.
 */
export { bluff, bool, cell, chain, clues, match, multi, numeric, order, pin, single, slider, sort, textQ, wall } from '../demo-quiz';
export { blank, crossword, cut, drawing, ladder, letters, list, moreless, sudoku, yt, type Cell } from '../mix-quiz';
export { img, memory, melody, optImages, reveal } from '../mega/kit';
export { jigsaw } from '../mix2/kit';
export { clip, wordle, type Slot } from '../school3/kit';
export { hinted } from '../big1/kit';
export { PIN_PLACES } from '../pin-places';

/** Фото: ключ → адреса на сайті (/uploads/…). */
export type Photos = (key: string) => string;
