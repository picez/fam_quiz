// «Словесна драбина» (26c): правила літер, спільні для схеми, рушія, редактора й скрипта словника.
// LIMITS читається лише всередині функцій: quiz.ts імпортує цей файл.
import { LIMITS } from './quiz';

/** Ключ слова: лише українські малі літери, між ними щонайбільше по одному апострофу. */
const LADDER_KEY = /^[а-щьюяєіїґ](?:'?[а-щьюяєіїґ])*$/u;
/** Типографські апострофи й гравіс, що їх пишуть замість «'». */
const APOSTROPHES = /[’ʼ‘`]/gu;

/** Ключ слова драбини: NFC, без пробілів по краях, малими, апостроф — «'»; не українське слово — null. Довжину не перевіряє. */
export function ladderKey(word: string): string | null {
  const key = word.normalize('NFC').trim().toLocaleLowerCase('uk').replace(APOSTROPHES, "'");
  return LADDER_KEY.test(key) ? key : null;
}

/** Літер у ключі, без апострофа. */
export function ladderLetters(key: string): number {
  return [...key.replaceAll("'", '')].length;
}

/** Ключі однакової довжини (кодові точки, апостроф — окрема позиція) з рівно однією відмінною позицією. */
export function oneLetterApart(a: string, b: string): boolean {
  const x = [...a];
  const y = [...b];
  if (x.length !== y.length) return false;
  let differences = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) differences++;
  return differences === 1;
}

export type LadderPathIssue = 'wordladder_word' | 'wordladder_length' | 'wordladder_step' | 'wordladder_steps';

/** Перша вада шляху ведучого по порядку: слово, довжина, крок, кількість кроків; немає — null. Словник не перевіряє. */
export function ladderPathIssue(path: readonly string[], maxSteps: number): LadderPathIssue | null {
  const keys = path.map(ladderKey);
  const fits = (key: string | null): key is string =>
    key !== null && ladderLetters(key) >= LIMITS.minWordLadderLetters && ladderLetters(key) <= LIMITS.maxWordLadderLetters;
  if (!keys.every(fits)) return 'wordladder_word';
  const valid = keys as string[];
  if (valid.some((k) => [...k].length !== [...valid[0]].length)) return 'wordladder_length';
  if (valid.some((k, i) => i > 0 && !oneLetterApart(valid[i - 1], k))) return 'wordladder_step';
  if (path.length - 1 > maxSteps) return 'wordladder_steps';
  return null;
}

/** Стовпчик на телефоні: понад 5 елементів — перші два, null («…») і останні два. */
export function collapseLadder<T>(items: readonly T[]): (T | null)[] {
  if (items.length <= 5) return [...items];
  const n = items.length;
  return [items[0], items[1], null, items[n - 2], items[n - 1]];
}
