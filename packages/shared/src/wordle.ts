// «Вгадай слово» (48): правила літер і кольорів, спільні для схеми, рушія й веба.
// LIMITS і answerKey читаються лише всередині функцій: quiz.ts імпортує цей файл.
import { LIMITS, answerKey } from './quiz';
import { ladderKey } from './wordladder';

export type WordleMark = 'hit' | 'near' | 'miss';

/** Ключ слова (ladderKey); не українське слово — null. */
export function wordleKey(word: string): string | null {
  return ladderKey(word);
}

/** Літери ключа без апострофа, по кодових точках. */
export function wordleLetters(key: string): string[] {
  return [...key.replaceAll("'", '')];
}

/** Ключі для пошуку в словнику: літери як є, потім з «'» після 1-ї, 2-ї, … передостанньої літери. */
export function wordleCandidates(letters: readonly string[]): string[] {
  const keys = [letters.join('')];
  for (let i = 1; i < letters.length; i++) keys.push(`${letters.slice(0, i).join('')}'${letters.slice(i).join('')}`);
  return keys;
}

/** Класичні кольори з повторами; довжини рівні (інакше — помилка програміста). */
export function wordleMarks(guess: readonly string[], target: readonly string[]): WordleMark[] {
  if (guess.length !== target.length) throw new Error('wordleMarks: lengths differ');
  const marks: WordleMark[] = guess.map(() => 'miss');
  const spare = new Map<string, number>();
  guess.forEach((letter, i) => {
    if (letter === target[i]) marks[i] = 'hit';
    else spare.set(target[i], (spare.get(target[i]) ?? 0) + 1);
  });
  guess.forEach((letter, i) => {
    if (marks[i] === 'hit') return;
    const left = spare.get(letter) ?? 0;
    if (left > 0) {
      marks[i] = 'near';
      spare.set(letter, left - 1);
    }
  });
  return marks;
}

const RANK: Record<WordleMark, number> = { miss: 0, near: 1, hit: 2 };

/** Найкраща позначка кожної літери з рядків (hit > near > miss). */
export function wordleKeyboard(rows: readonly { letters: readonly string[]; marks: readonly WordleMark[] }[]): Record<string, WordleMark> {
  const best: Record<string, WordleMark> = {};
  for (const row of rows) {
    row.letters.forEach((letter, i) => {
      const mark = row.marks[i];
      if (best[letter] === undefined || RANK[mark] > RANK[best[letter]]) best[letter] = mark;
    });
  }
  return best;
}

/** 'wordle_word', якщо ключа немає чи літер не minWordleLetters…maxWordleLetters; інакше null. */
export function wordleWordIssue(word: string): 'wordle_word' | null {
  const key = wordleKey(word);
  if (key === null) return 'wordle_word';
  const n = wordleLetters(key).length;
  return n >= LIMITS.minWordleLetters && n <= LIMITS.maxWordleLetters ? null : 'wordle_word';
}

/**
 * Текст запитання видно всім: чи є в ньому слово цілим словом — як є (апострофи ’ʼ‘` зведено до '), без апострофа
 * («піря» для «пір'я») чи з подвоєною літерою замість нього («пірря»). Спільне правило схеми (wordle_leak) і редактора.
 */
export function wordleLeak(word: string, text: string): boolean {
  const wordsOf = (value: string) => answerKey(value).split(/[^\p{L}\p{N}']+/u).filter(Boolean).join(' ');
  const key = wordsOf(word);
  if (key === '') return false;
  const plain = ' ' + wordsOf(text) + ' ';
  const bare = plain.replaceAll("'", '');
  return plain.includes(' ' + key + ' ') || bare.includes(' ' + key.replaceAll("'", '') + ' ') || (key.includes("'") && bare.includes(' ' + key.replace(/(\p{L})'/gu, '$1$1') + ' '));
}

/**
 * Назва зіграного запитання для цікавинок, «↶ Бали» й історії (61, 45d): у «Вгадай слово» тексту автора в грі немає —
 * там слово великими літерами (його вже розкрито); в інших — текст.
 */
export function playedText(question: { type: string; text: string; word?: string }): string {
  return question.type === 'wordle' && typeof question.word === 'string' ? question.word.toLocaleUpperCase('uk') : question.text;
}

/** Бали за розгадку зі спроби tries (1…wordleTries). */
export function wordlePoints(price: number, tries: number): number {
  return Math.round((price * (LIMITS.wordleTries + 1 - tries)) / LIMITS.wordleTries);
}

/** Розкладка ЙЦУКЕН без апострофа. */
export const WORDLE_KEYBOARD: readonly (readonly string[])[] = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ї'],
  ['ф', 'і', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'є'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ґ'],
];
