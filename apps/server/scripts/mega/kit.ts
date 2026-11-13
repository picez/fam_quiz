/**
 * Набір для «Великого шкільного марафону» (сід `mega`): помічники запитань із картинками й контракт файлів тем.
 * Кожен файл теми експортує функцію (photos) => слоти та IMAGES — ключ → стаття англійської Вікіпедії
 * або «File:…» з Wikimedia Commons (сід вантажить їх на сайт). id запитанням дає збирач (mega-quiz.ts).
 */
import type { MemoryGrid, Question } from '@quiz/shared';
import { blank, type Cell } from '../mix-quiz';

export { bool, cell, clues, duelCategory, duelQ, match, multi, numeric, order, pin, single, slider, sort, textQ, wall, chain, bluff } from '../demo-quiz';
export { blank, crossword, cut, drawing, ladder, letters, list, moreless, sudoku, yt, type Cell } from '../mix-quiz';
export { jigsaw, type BoardSlot } from '../mix2/kit';
export { PIN_PLACES } from '../pin-places';

/** Фото: ключ → адреса на сайті (/uploads/…). */
export type Photos = (key: string) => string;

/** Картинка до запитання (над текстом). */
export const img = (question: Question, url: string): Question => ({ ...question, imageUrl: url });

/** Картинка, що поступово проявляється (лише single/text/numeric і лише в класичному раунді). */
export const reveal = (question: Question, url: string, mode: 'pixels' | 'blur' = 'pixels'): Question => ({ ...question, imageUrl: url, reveal: mode });

/**
 * Картинки у варіантах single/multi: urls[i] — картинка i-го варіанта (undefined — без картинки).
 * Підпис варіанта можна лишити порожнім (''), тоді варіант — лише картинка.
 */
export const optImages = (question: Question, urls: (string | undefined)[]): Question => {
  if (question.type !== 'single' && question.type !== 'multi') throw new Error('optImages: only single/multi');
  return { ...question, options: question.options.map((o, i) => (urls[i] ? { ...o, imageUrl: urls[i] } : o)) } as Question;
};

/** Картка «Пам'яті»: текст (≤ 40 знаків) або картинка. */
export type MemoryCard = { text: string } | { image: string };
const card = (c: MemoryCard) => ('text' in c ? { text: c.text } : { text: '', imageUrl: c.image });

/** «Пам'ять»: пари «питання — відповідь»; 3x4 — 6 пар, 4x4 — 8, 4x5 — 10. */
export const memory = (text: string, grid: MemoryGrid, pairs: [MemoryCard, MemoryCard][], points: number, time = 120, seed = 11): Question => ({
  ...blank(text, points, time),
  type: 'memory',
  grid,
  pairs: pairs.map(([a, b]) => ({ a: card(a), b: card(b) })),
  seed,
});

/** «Мелодія за нотами»: трек з YouTube (id перевірити через oEmbed), шматки 1, 2, 4, 8, 16 с від start; accepted — назва. */
export const melody = (text: string, youtubeId: string, start: number, accepted: string[], points: number, time = 60): Question => ({
  ...blank(text, points, time),
  type: 'melody',
  track: { source: 'youtube', id: youtubeId, start },
  accepted,
});

/** «Знайди відмінності»: дві картинки, пропорція ширина/висота, кола відмінностей (частки ширини/висоти, r — частка ширини). */
export const spotdiff = (text: string, original: string, changed: string, aspect: number, spots: { x: number; y: number; r: number }[], points: number, time = 120): Question => ({
  ...blank(text, points, time),
  type: 'spotdiff',
  original,
  changed,
  aspect,
  spots,
});

/** Клітинки однієї категорії поля «Великого марафону»: рівно 5, ціни 100…500 за складністю, плюс запасна. */
export type MegaSlot = { cells: Cell[]; spare: Question };
