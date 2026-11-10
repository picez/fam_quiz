// «Слова з літер» (27d): роздача сервера — випадковий набір, у якому завжди є слово словника, і найдовші можливі слова.
// Словник той самий, що в драбини; клієнт його не отримує ніколи.
import { LETTER_VOWELS, LIMITS, wordLetters } from '@quiz/shared';
import type { NounDictionary } from '../wordladder/nouns';

/** 33 літери абетки: позиція літери — її клітинка в лічильнику Uint8Array. */
const ALPHABET = [...'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя'];
const SLOT = new Map(ALPHABET.map((letter, i) => [letter, i]));
const G = SLOT.get('ґ') as number;
/** Найдовші слова словника. */
const LONGEST = LIMITS.maxWordLadderLetters;
const ATTEMPTS = 24;
/** Частка голосних у випадковому наборі щонайменше. */
const VOWEL_SHARE = 0.35;

interface Entry {
  key: string;
  /** Літер без апострофа. */
  length: number;
  counts: Uint8Array;
  /** Клітинки, де counts > 0: перевірка набору дивиться лише на них. */
  slots: Uint8Array;
  vowels: number;
}

/** Індекс літер словника; внутрішність — у Built. */
export interface LetterIndex {
  readonly size: number;
}

interface Built extends LetterIndex {
  entries: Entry[];
  /** Слова без «ґ» за довжиною: з них береться слово-основа випадкового набору. */
  seeds: Map<number, Entry[]>;
  /** Частоти літер у словнику (без «ґ») і окремо голосних — для доповнення набору. */
  weights: number[];
  vowelWeights: number[];
}

const built = new WeakMap<NounDictionary, Built>();

function entryOf(key: string): Entry | null {
  const letters = wordLetters(key);
  const counts = new Uint8Array(ALPHABET.length);
  for (const letter of letters) {
    const slot = SLOT.get(letter);
    if (slot === undefined) return null;
    counts[slot] += 1;
  }
  const slots = Uint8Array.from([...counts.keys()].filter((i) => counts[i] > 0));
  return { key, length: letters.length, counts, slots, vowels: letters.filter((l) => LETTER_VOWELS.has(l)).length };
}

/** Індекс словника: будується при першому виклику для цього словника (не під час запуску сервера) і далі той самий. */
export function letterIndexOf(nouns: NounDictionary): LetterIndex {
  const known = built.get(nouns);
  if (known !== undefined) return known;
  const entries: Entry[] = [];
  const seeds = new Map<number, Entry[]>();
  const weights = new Array<number>(ALPHABET.length).fill(0);
  for (const key of nouns.keys()) {
    const entry = entryOf(key);
    if (entry === null) continue;
    entries.push(entry);
    for (const slot of entry.slots) weights[slot] += entry.counts[slot];
    if (entry.counts[G] !== 0) continue;
    const pool = seeds.get(entry.length);
    if (pool === undefined) seeds.set(entry.length, [entry]);
    else pool.push(entry);
  }
  weights[G] = 0;
  const vowelWeights = weights.map((w, i) => (LETTER_VOWELS.has(ALPHABET[i]) ? w : 0));
  const index: Built = { entries, seeds, weights, vowelWeights, size: entries.length };
  built.set(nouns, index);
  return index;
}

function countsOf(letters: readonly string[]): Uint8Array {
  const counts = new Uint8Array(ALPHABET.length);
  for (const letter of letters) {
    const slot = SLOT.get(letter);
    if (slot !== undefined) counts[slot] += 1;
  }
  return counts;
}

function fits(entry: Entry, set: Uint8Array): boolean {
  for (const slot of entry.slots) if (entry.counts[slot] > set[slot]) return false;
  return true;
}

/** Слова словника ≥ minLetterWord літер, що складаються з набору. */
function foundIn(index: Built, letters: readonly string[]): Entry[] {
  const set = countsOf(letters);
  return index.entries.filter((e) => e.length >= LIMITS.minLetterWord && e.length <= letters.length && fits(e, set));
}

/** Найдовші можливі слова (до двох: довжина спадно, далі за абеткою) і скільки слів складається з набору. */
export function dealOf(index: LetterIndex, letters: readonly string[]): { best: string[]; possible: number } {
  const found = foundIn(index as Built, letters);
  found.sort((a, b) => b.length - a.length || a.key.localeCompare(b.key, 'uk'));
  return { best: found.slice(0, 2).map((e) => e.key), possible: found.length };
}

function weighted(weights: readonly number[], rng: () => number): string {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (weights[i] > 0 && r < 0) return ALPHABET[i];
  }
  // Похибка округлення — остання літера з вагою; порожній словник — «а».
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return ALPHABET[i];
  return 'а';
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Слово-основа: випадкове слово без «ґ» довжини L чи L − 1 (L = min(7, count); для count ≤ 4 — від 3). Від випадкового місця
 * береться перше, з яким набір ще може набрати need голосних. Таких довжин у словнику немає — будь-яке коротше.
 */
function seedOf(index: Built, count: number, need: number, rng: () => number): Entry | null {
  const top = Math.min(LONGEST, count);
  const from = count <= 4 ? LIMITS.minLetterWord : top - 1;
  const pick = (lengths: number[]): Entry | null => {
    const pools = lengths.map((n) => index.seeds.get(n) ?? []);
    const total = pools.reduce((sum, pool) => sum + pool.length, 0);
    if (total === 0) return null;
    const at = (i: number): Entry => {
      for (const pool of pools) {
        if (i < pool.length) return pool[i];
        i -= pool.length;
      }
      throw new Error('out of range');
    };
    const start = Math.floor(rng() * total);
    for (let k = 0; k < total; k++) {
      const entry = at((start + k) % total);
      if (entry.vowels + count - entry.length >= need) return entry;
    }
    return at(start);
  };
  const lengths = (lo: number, hi: number) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
  return pick(lengths(from, top)) ?? pick(lengths(LIMITS.minLetterWord, from - 1));
}

function attemptOf(index: Built, count: number, rng: () => number): string[] {
  const need = Math.ceil(count * VOWEL_SHARE);
  const seed = seedOf(index, count, need, rng);
  const base = seed === null ? [] : wordLetters(seed.key);
  const filler: string[] = [];
  while (base.length + filler.length < count) filler.push(weighted(index.weights, rng));
  let vowels = [...base, ...filler].filter((l) => LETTER_VOWELS.has(l)).length;
  while (vowels < need) {
    const consonants = filler.flatMap((l, i) => (LETTER_VOWELS.has(l) ? [] : [i]));
    if (consonants.length === 0) break;
    filler[consonants[Math.floor(rng() * consonants.length)]] = weighted(index.vowelWeights, rng);
    vowels += 1;
  }
  return shuffled([...base, ...filler], rng);
}

/**
 * Випадковий набір з count літер, детермінований для того самого rng: слово-основа словника, доповнення за частотою літер
 * (без «ґ», голосних ≥ 35 %), перемішано. До 24 спроб: перша, з якої складається GOOD слів (12 для 8+ літер, інакше 5),
 * перемагає, інакше — та, з якої складається найбільше.
 */
export function pickLetters(index: LetterIndex, count: number, rng: () => number): string[] {
  const own = index as Built;
  const good = count >= 8 ? 12 : 5;
  let best: { letters: string[]; possible: number } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const letters = attemptOf(own, count, rng);
    const possible = foundIn(own, letters).length;
    if (possible >= good) return letters;
    if (best === null || possible > best.possible) best = { letters, possible };
  }
  return (best as { letters: string[] }).letters;
}
