/**
 * Словник «Словесної драбини» (26c): разовий скрипт збирання з VESUM.
 *
 * Як запускати:
 * 1. Вручну завантажити й розпакувати, у порожню теку поза репозиторієм:
 *    curl -L -o dict.bz2 https://github.com/brown-uk/dict_uk/releases/download/v6.8.6/dict_corp_vis.txt.bz2 && bzip2 -dc dict.bz2 > dict_corp_vis.txt
 * 2. Запустити:
 *    pnpm --filter @quiz/server exec tsx scripts/wordladder-dict.ts <шлях до dict_corp_vis.txt>
 *
 * Скрипт читає файл потоком (у ньому 319 МБ) і перезаписує apps/server/data/wordladder-uk.txt.
 * Мережі скрипт не торкається. Сирих даних VESUM у репозиторії немає.
 * Дані VESUM — CC BY-NC-SA 4.0; атрибуція в шапці файлу словника й у CREDITS.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { LIMITS, ladderKey, ladderLetters } from '@quiz/shared';

export const VESUM_VERSION = 'v6.8.6';

/** Куди пише скрипт. */
const OUT_FILE = resolve(import.meta.dirname, '../data/wordladder-uk.txt');

/**
 * Ключі, пов'язані з росією (правило власника: нічого про росію). Переглянуто вручну серед кандидатів,
 * яких друкує скрипт (CANDIDATE_STEMS); звичайні слова на кшталт «роса» чи «русло» лишаються.
 */
export const EXCLUDED: ReadonlySet<string> = new Set([
  // Росія, росіяни, «руський світ» і прізвиська.
  'кацап', 'кацапка', 'кацапня', 'кремль', 'малорос', 'москаль', 'москвин', 'москвич', 'новорос',
  'раша', 'рашизм', 'рашист', 'рашка', 'росич', 'росичка', 'рус', 'русак', 'русизм', 'русист', 'русич', 'руснак', 'русня',
  'русофіл', 'русофоб', 'русофон', 'урус', 'ватнік', 'орк', 'оркиня', 'мордор', 'путлер', 'скрепа', 'вагнер',
  'сепар', 'сепарка', 'сепарня', 'царат', 'царизм',
  // Радянське й російські спецслужби.
  'гебня', 'гебіст', 'чекіст', 'колгосп', 'ленінка', 'совкізм', 'хрущоба',
  // Сибір і народи, чия батьківщина в межах росії.
  'сибірка', 'сибіряк', 'башкир', 'бурят', 'бурятка', 'калмик', 'комі', 'мокша', 'удмурт', 'чуваш', 'чувашка', 'чечен', 'чеченка',
  'якут', 'якутка',
]);

/** Основи, слова з якими скрипт друкує для ручного перегляду EXCLUDED. */
const CANDIDATE_STEMS = [
  'моск', 'кацап', 'раш', 'рус', 'рос', 'кремл', 'путін', 'путл', 'совк', 'совок', 'совєт', 'ватн', 'орк', 'мордор', 'гебі', 'гебн',
  'чекіст', 'колгосп', 'ленін', 'сталін', 'сибір', 'сепар', 'скреп', 'вагнер', 'цари', 'царат', 'хрущоб',
];

/** Однина, називний: рід m, f чи n. */
const NOMINATIVE_SINGULAR = [':m:v_naz', ':f:v_naz', ':n:v_naz'];
/** Позначки, з якими слово не береться: власна назва, скорочення, лайка, рідкісний варіант, займенник. */
const SKIPPED_TAGS = new Set(['prop', 'abbr', 'bad', 'alt', 'vulg', 'obsc', 'pron']);

/** Рядок dict_corp_vis.txt → ключ іменника в називному однини 3–7 літер або null. */
export function nounOf(line: string): string | null {
  const [body = ''] = line.split('#', 1);
  const [word, tags] = body.trim().split(/\s+/);
  if (word === undefined || tags === undefined || !tags.startsWith('noun:')) return null;
  if (!NOMINATIVE_SINGULAR.some((tag) => tags.includes(tag))) return null;
  if (tags.split(':').some((tag) => SKIPPED_TAGS.has(tag))) return null;
  // Як записано: велика літера (власна назва) дає інший ключ і відпадає.
  if (ladderKey(word) !== word) return null;
  const letters = ladderLetters(word);
  if (letters < LIMITS.minWordLadderLetters || letters > LIMITS.maxWordLadderLetters) return null;
  return EXCLUDED.has(word) ? null : word;
}

/** Рядки '# …' з атрибуцією й ліцензією для шапки файлу словника. */
export function header(): string[] {
  return [
    `# Word ladder dictionary derived from VESUM (dict_uk ${VESUM_VERSION}) by brown-uk, https://github.com/brown-uk/dict_uk`,
    '# License: CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/',
    '# Changes: nouns in nominative singular, 3–7 letters, lowercased, filtered',
  ];
}

async function build(source: string): Promise<void> {
  const nouns = new Set<string>();
  const lines = createInterface({ input: createReadStream(source, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const noun = nounOf(line);
    if (noun !== null) nouns.add(noun);
  }
  const words = [...nouns].sort();
  writeFileSync(OUT_FILE, [...header(), ...words].join('\n') + '\n', 'utf8');
  const candidates = words.filter((w) => CANDIDATE_STEMS.some((stem) => w.includes(stem)));
  console.log(`${words.length} words → ${OUT_FILE}`);
  console.log(`Review for EXCLUDED (${candidates.length}): ${candidates.join(' ')}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const source = process.argv.slice(2).find((arg) => arg !== '--');
  if (source === undefined) {
    console.error('Usage: tsx scripts/wordladder-dict.ts <path to dict_corp_vis.txt>');
    process.exit(1);
  }
  await build(source);
}
