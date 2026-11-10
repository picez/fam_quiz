// «Слова з літер» (27d): правила літер, спільні для схеми, рушія, сервера й телефона.
// LIMITS читається лише всередині функцій: quiz.ts імпортує цей файл.
import { LIMITS } from './quiz';

/** Голосні українські літери. */
export const LETTER_VOWELS: ReadonlySet<string> = new Set(['а', 'е', 'є', 'и', 'і', 'ї', 'о', 'у', 'ю', 'я']);

const SET_LETTER = /^[а-щьюяєіїґ]$/u;
/** Роздільники набору, що не є літерами: пробіли, коми, дефіси й апострофи. */
const SET_SKIP = /[\s,\-'’ʼ‘`]/gu;

/** Набір ведучого → літери (малі, NFC, без роздільників); інший символ чи довжина поза minLetterSet…maxLetterSet — null. */
export function letterSet(text: string): string[] | null {
  const letters = [...text.normalize('NFC').toLocaleLowerCase('uk').replace(SET_SKIP, '')];
  if (!letters.every((l) => SET_LETTER.test(l))) return null;
  if (letters.length < LIMITS.minLetterSet || letters.length > LIMITS.maxLetterSet) return null;
  return letters;
}

/** Літери ключа ladderKey без апострофа. */
export function wordLetters(key: string): string[] {
  return [...key.replaceAll("'", '')];
}

/** Чи складається ключ з набору: кожна літера — не більше разів, ніж у наборі. */
export function fitsLetters(key: string, letters: readonly string[]): boolean {
  const left = new Map<string, number>();
  for (const l of letters) left.set(l, (left.get(l) ?? 0) + 1);
  for (const l of wordLetters(key)) {
    const n = left.get(l) ?? 0;
    if (n === 0) return false;
    left.set(l, n - 1);
  }
  return true;
}
