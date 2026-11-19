/**
 * Набір для «Великої гри І» (сід `big1`): помічники запитань і контракт файлів тем.
 * id запитанням дає збирач (big1-quiz.ts), тож у файлах тем id не потрібні.
 */
import type { Question } from '@quiz/shared';
import { clues } from '../demo-quiz';

export { bool, cell, chain, match, multi, numeric, order, pin, single, slider, sort, textQ } from '../demo-quiz';
export { blank, crossword, drawing, ladder, letters, list, moreless, sudoku, type Cell } from '../mix-quiz';
export { memory } from '../mega/kit';
export { alike, noOver, spy, think, wordle } from '../school3/kit';
export type { Slot } from '../school3/kit';

/** «Хто я?» у власному темпі (12c): кожен гравець сам відкриває підказки; таймер ≥ 20 с. */
export const selfClues = (text: string, hints: string[], accepted: string[], points: number, time = 45): Question => ({
  ...clues(text, hints, accepted, 8, points, time),
  cluePace: 'self',
});

/** Запитання з підказкою для бафу чи підказки «Мільйонера». */
export const hinted = (question: Question, hint: string): Question => ({ ...question, hint });

/** «Більше чи менше» з кроком (37b): кожне наступне порівняння дорожче на step. */
export const stepped = (question: Question, step: number): Question => (question.type === 'moreless' ? { ...question, step } : question);
