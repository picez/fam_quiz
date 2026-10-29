import type { Question } from './quiz';

/** «Ризик» (12h): у скільки разів множаться бали правильної відповіді. */
export const RISK_FACTOR = 3;
/** «Перша літера» (12h): частка додатних балів. */
export const LETTER_SHARE = 0.75;
/** «Бінокль» (12h): ширина проміжку повзунка — частка шкали; число — ±частка від правильного, щонайменше ±numericMin; точка — сторона вікна в частках основи. */
export const SCOPE = { sliderShare: 0.2, numericShare: 0.1, numericMin: 2, pinSize: 0.5 } as const;
/** «Ризик» (12h): типи з однозначною відповіддю. */
export const RISK_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'slider', 'clues', 'pin'] as const satisfies readonly Question['type'][];
/** «Перша літера» (12h): текст і «Хто я?». */
export const LETTER_TYPES = ['text', 'clues'] as const satisfies readonly Question['type'][];
/** «Бінокль» (12h): число, повзунок і точка на мапі. */
export const SCOPE_TYPES = ['numeric', 'slider', 'pin'] as const satisfies readonly Question['type'][];

/** Апострофи: ʼ (U+02BC) і ʻ — у Unicode літери-модифікатори, тож перевіряються раніше за літери. */
const APOSTROPHE = /[ʼʻ’‘'`ʹ]/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const MARK = /\p{M}/u;
const SPACE = /\s/u;

/**
 * «Перша літера» (12h): перша літера великою, маска решти й кількість літер; null — у написанні немає літер (план 12h, «Перша літера»).
 * letters рахує літери й цифри; апострофи, дефіси й пробіли не рахуються. Написання спершу складається в NFC, а знаки без пари відкидаються.
 */
export function letterMask(spelling: string): { first: string; mask: string; letters: number } | null {
  const marks: string[] = [];
  let first: string | null = null;
  let letters = 0;
  for (const char of spelling.normalize('NFC').trim()) {
    if (APOSTROPHE.test(char)) marks.push(char);
    else if (MARK.test(char)) continue;
    else if (WORD_CHAR.test(char)) {
      letters += 1;
      if (first === null) {
        first = char.toLocaleUpperCase('uk');
        marks.push(first);
      } else marks.push('_');
    } else if (SPACE.test(char)) {
      // Кілька пробілів поспіль — одна крапка.
      if (marks.at(-1) !== '·') marks.push('·');
    } else marks.push(char);
  }
  return first === null ? null : { first, mask: marks.join(' '), letters };
}
