/**
 * Набір для «Великої гри ІІІ» (сід `big3`): помічники запитань і контракт файлів тем.
 * id запитанням дає збирач (big3-quiz.ts), тож у файлах тем id не потрібні (крім «хмари слів»: на неї посилається «100 до 1»).
 */
import type { Question } from '@quiz/shared';

export { bluff, bool, cloud, match, multi, numeric, order, poll, single, slider, sort, textQ } from '../demo-quiz';
export { blank, crossword, cut, list, moreless, sudoku } from '../mix-quiz';
export { memory, spotdiff } from '../mega/kit';
export { alike, clip, wordle } from '../school3/kit';

/** Фото: ключ → адреса на сайті (/uploads/…). */
export type Photos = (key: string) => string;

/** «Більше чи менше» з кроком (37b): кожне наступне порівняння дорожче на step. */
export const stepped = (question: Question, step: number): Question => (question.type === 'moreless' ? { ...question, step } : question);
