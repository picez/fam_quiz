/** «Думай інакше» (35): м'які ключі слів. Без залежностей: quiz.ts бере звідси thinkWordsIssue для схеми. */

/** Слово ведучого з необов'язковими синонімами (форма thinkWordSchema у quiz.ts). */
interface ThinkWordLike {
  word: string;
  synonyms: readonly string[];
}

/**
 * Закінчення, які відкидає thinkStem, від довших до коротших (кириличні; латиниця лишається як є).
 * Без «ові», «еві», «єві»: інакше «фіолетові» / «рожеві» (множина прикметника) втратили б «ов» / «ев» і розійшлися б із «фіолетовий» / «рожевий».
 * «ьою», «ьої» — м'які прикметники: «синьою», «синьої» ≈ «синій».
 */
export const THINK_ENDINGS: readonly string[] = [
  'ього', 'ьому', 'ого', 'ому', 'ими', 'іми', 'ями', 'ами', 'ією', 'ьою', 'ьої',
  'ий', 'ій', 'ої', 'ою', 'ею', 'єю', 'им', 'ім', 'их', 'іх', 'ів', 'їв', 'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'єм', 'ія', 'ії', 'ію',
  'а', 'я', 'о', 'е', 'є', 'і', 'ї', 'и', 'у', 'ю', 'ь', 'й',
];

/** Найкоротше стебло, яке лишає thinkStem, літер. */
const MIN_STEM = 3;

/**
 * Ключ слова: NFC, без апострофів (' ’ ʼ ` ‘ ′ ´) і знаків наголосу, кожен символ, що не літера, не цифра й не пробіл
 * (розділові, лапки, дефіси й тире, емодзі), — пробіл; пробіли зведено, обрізано, toLowerCase.
 * Тож «пʼять» = «п'ять» = «пять», «Червоний!» = «"червоний"» = «червоний», «темно-синій» = «темно синій».
 */
export function thinkKey(value: string): string {
  return value
    .normalize('NFC')
    .replace(/['’ʼ`‘′´]/g, '')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Одне слово без найдовшого закінчення з THINK_ENDINGS, після якого лишається щонайменше MIN_STEM літер. */
function stemWord(word: string): string {
  const letters = [...word];
  for (const ending of THINK_ENDINGS) {
    const size = [...ending].length;
    if (letters.length - size >= MIN_STEM && word.endsWith(ending)) return letters.slice(0, letters.length - size).join('');
  }
  return word;
}

/** Стебло: thinkKey, далі кожне слово (за пробілами) без одного закінчення; слова з'єднано пробілом. «Фіолетова» → «фіолетов». */
export function thinkStem(value: string): string {
  const key = thinkKey(value);
  return key === '' ? '' : key.split(' ').map(stemWord).join(' ');
}

/**
 * Перевірка слів одного запитання: слово чи синонім без жодної літери чи цифри (thinkKey порожній) — think_word_empty;
 * повтор за thinkStem — think_words_dup (одна відповідь не веде у два слова).
 */
export function thinkWordsIssue(words: readonly ThinkWordLike[]): 'think_word_empty' | 'think_words_dup' | null {
  const spellings = words.flatMap((w) => [w.word, ...w.synonyms]);
  if (spellings.some((s) => thinkKey(s) === '')) return 'think_word_empty';
  const stems = spellings.map(thinkStem);
  return new Set(stems).size === stems.length ? null : 'think_words_dup';
}
