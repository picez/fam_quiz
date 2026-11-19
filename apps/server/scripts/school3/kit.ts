/**
 * Набір для «Великого шкільного марафону ІІІ» (сід `school3`): помічники запитань нових типів і контракт файлів тем.
 * id запитанням дає збирач (school3-quiz.ts), тож у файлах тем id не потрібні.
 */
import type { Question } from '@quiz/shared';
import { blank, type Cell } from '../mix-quiz';

export { bool, cell, clues, duelCategory, duelQ, match, multi, numeric, order, single, slider, sort, textQ } from '../demo-quiz';
export { blank, crossword, cut, moreless, sudoku, type Cell } from '../mix-quiz';
export { melody } from '../mega/kit';

/** Клітинки однієї категорії поля: рівно 5, ціни 100…500 за складністю, плюс запасна (простий тип, без медіа). */
export type Slot = { cells: Cell[]; spare: Question };

/** «Відео за фрагментами» (36): ролик YouTube (id перевірено через oEmbed), шматки 1, 2, 4, 8, 16 с від start. */
export const clip = (text: string, id: string, start: number, accepted: string[], points: number, muted = true, time = 60): Question => ({
  ...blank(text, points, time),
  type: 'videoclip',
  clip: { id, start },
  muted,
  accepted,
});

/** «Вгадай слово» (48): шість спроб, слово 4–7 літер зі словника драбини. */
export const wordle = (text: string, word: string, points: number, time = 100): Question => ({ ...blank(text, points, time), type: 'wordle', word });

/** «Не перебільш» (37d): перемагає найближча відповідь знизу; більша за правильну — нуль. */
export const noOver = (text: string, correct: number, points: number, time = 35): Question => ({
  ...blank(text, points, time),
  type: 'numeric',
  correct,
  tolerance: 0,
  noOvershoot: true,
});

/** «Думай як усі» (37e): тема, бали — найбільшій групі схожих відповідей. */
export const alike = (text: string, points: number, time = 30): Question => ({ ...blank(text, points, time), type: 'thinkalike' });

/** «Шпигун» (38, 50): players — слово гравців (перше написання), hint — підказка шпигуну (`null` — без підказки, ключа немає). */
export const spy = (text: string, players: string[], hint: string | null, points: number, time = 40, voteTime = 30): Question => ({
  ...blank(text, points, time),
  type: 'spy',
  accepted: players,
  ...(hint === null ? {} : { spyHint: hint }),
  voteTime,
});

type Word = readonly [word: string, ...synonyms: string[]];

/** «Думай інакше» (35): тема й три найочевидніші слова ведучого (перше в кортежі — слово, далі синоніми); points — 0. */
export const think = (text: string, words: readonly [Word, Word, Word], time = 30): Question => ({
  ...blank(text, 0, time),
  type: 'think',
  words: words.map(([word, ...synonyms]) => ({ word, synonyms })),
});
