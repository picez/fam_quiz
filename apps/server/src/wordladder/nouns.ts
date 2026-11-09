// Словник іменників «Словесної драбини» (26c): простий текст, одне слово-ключ у рядку, шапка з рядків '#'.
// Рушій словника не знає: сервер передає йому isNoun.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ladderKey } from '@quiz/shared';

export interface NounDictionary {
  /** key — ключ ladderKey. */
  isNoun(key: string): boolean;
  readonly size: number;
}

/** Закомічений словник, зібраний scripts/wordladder-dict.ts з VESUM. */
export const NOUNS_FILE = resolve(import.meta.dirname, '../../data/wordladder-uk.txt');

function dictionaryOf(words: Set<string>): NounDictionary {
  return { isNoun: (key) => words.has(key), size: words.size };
}

/** Текст словника → словник; порожні рядки й рядки '#' пропускаються. */
export function parseNouns(text: string): NounDictionary {
  const words = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line !== '' && !line.startsWith('#')) words.add(line);
  }
  return dictionaryOf(words);
}

export function loadNouns(file: string = NOUNS_FILE): NounDictionary {
  return parseNouns(readFileSync(file, 'utf8'));
}

/** Читає файл при першому isNoun чи size, а не під час запуску сервера. */
export function lazyNouns(file: string = NOUNS_FILE): NounDictionary {
  let loaded: NounDictionary | null = null;
  const get = () => (loaded ??= loadNouns(file));
  return {
    isNoun: (key) => get().isNoun(key),
    get size() {
      return get().size;
    },
  };
}

/** Для тестів: словник зі слів через ladderKey; не українські слова пропускаються. */
export function nounsOf(words: readonly string[]): NounDictionary {
  return dictionaryOf(new Set(words.map(ladderKey).filter((key): key is string => key !== null)));
}
