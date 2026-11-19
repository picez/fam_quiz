/**
 * Набір для «Великої гри ІІ» (сід `big2`): помічники запитань і контракт файлів тем.
 * id запитанням дає збирач (big2-quiz.ts), тож у файлах тем id не потрібні.
 */
import type { Question } from '@quiz/shared';
import { blank } from '../mix-quiz';
import { clues } from '../demo-quiz';

export { bluff, bool, duelCategory, duelQ, match, multi, numeric, order, single, slider, survey, textQ, wall } from '../demo-quiz';
export { blank, crossword, cut } from '../mix-quiz';
export { jigsaw } from '../mix2/kit';
export { melody, memory, type MemoryCard } from '../mega/kit';

/** Фото: ключ → адреса на сайті (/uploads/…). */
export type Photos = (key: string) => string;

/** «Хто я?» на таймері (12c): нова підказка відкривається для всіх кожні interval секунд; час — щоб остання встигла. */
export const timedClues = (text: string, hints: string[], accepted: string[], interval: number, points: number, time = 40): Question => ({
  ...clues(text, hints, accepted, interval, points, time),
  cluePace: 'timer',
});

/** Судоку 6×6 з цифрами ведучого (28d, level custom): givens і solution перевіряє sudokuIssue у тесті. */
export const customSudoku = (text: string, givens: string, solution: string, points: number, time = 240): Question => ({
  ...blank(text, points, time),
  type: 'sudoku',
  level: 'custom',
  seed: null,
  givens,
  solution,
});
