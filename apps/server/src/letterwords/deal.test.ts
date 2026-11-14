import { describe, expect, it } from 'vitest';
import { seededRng } from '@quiz/engine';
import { LETTER_VOWELS, fitsLetters } from '@quiz/shared';
import { loadNouns, nounsOf } from '../wordladder/nouns';
import { dealOf, letterIndexOf, pickLetters } from './deal';

// Невеликий словник з побуту й природи: слова 3–7 літер, два з «ґ».
const SMALL = nounsOf([
  'кіт', 'сік', 'ліс', 'сом', 'рак', 'мак', 'кит', 'сир', 'віск', 'стіл', 'сітка', 'морква', 'острів', 'ставок',
  'верстак', 'кентавр', 'комісар', 'самотік', 'квітка', 'нитка', 'мама', 'тато', 'рука', 'нога', 'вода', 'каса',
  'вікно', 'місто', 'сосна', 'весна', 'карта', 'ракета', 'кавун', 'вітер', 'ліхтар', 'острах', 'молоток', 'кошеня',
  'ґава', 'ґанок', "м'ясо",
]);

const COUNTS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe('letter index (27d)', () => {
  it('indexes the dictionary once per dictionary', () => {
    const index = letterIndexOf(SMALL);
    expect(index.size).toBe(SMALL.size);
    expect(letterIndexOf(SMALL)).toBe(index);
  });

  it('a random set always holds a dictionary word and is the same for the same rng', () => {
    const index = letterIndexOf(SMALL);
    for (const count of COUNTS) {
      for (const seed of SEEDS) {
        const set = pickLetters(index, count, seededRng(seed));
        expect(set).toHaveLength(count);
        expect(set).not.toContain('ґ');
        for (const l of set) expect(l).toMatch(/^[а-щьюяєії]$/u);
        expect(dealOf(index, set).possible).toBeGreaterThanOrEqual(1);
        expect(pickLetters(index, count, seededRng(seed))).toEqual(set);
      }
    }
  });

  it('a random set has enough vowels', () => {
    const index = letterIndexOf(SMALL);
    for (const count of COUNTS) {
      for (const seed of SEEDS) {
        const set = pickLetters(index, count, seededRng(seed));
        expect(set.filter((l) => LETTER_VOWELS.has(l)).length).toBeGreaterThanOrEqual(Math.ceil(count * 0.35));
      }
    }
  });

  it('dealOf finds the two longest words, longest first, then by the alphabet', () => {
    const index = letterIndexOf(SMALL);
    // «морквасті»: морква, острів, ставок; сім літер — комісар і самотік.
    const deal = dealOf(index, [...'морквасті']);
    expect(deal.best).toEqual(['комісар', 'самотік']);
    // Лише одне слово найбільшої довжини: друге — з наступної.
    expect(dealOf(index, [...'кітсо'])).toEqual({ best: ['кіт', 'сік'], possible: 2 });
    expect(dealOf(index, [...'морквау']).best).toEqual(['морква', 'рука']);
    // Апостроф плитки не займає; кількість літер має значення.
    expect(dealOf(index, [...'мясо']).best).toEqual(["м'ясо", 'сом']);
    expect(dealOf(index, [...'маха']).possible).toBe(0);
    expect(dealOf(index, [...'бджжщ'])).toEqual({ best: [], possible: 0 });
  });

  it('the real dictionary gives several words for nine letters', () => {
    const index = letterIndexOf(loadNouns());
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) total += dealOf(index, pickLetters(index, 9, seededRng(seed))).possible;
    expect(total / 20).toBeGreaterThanOrEqual(12);
    const from = performance.now();
    const set = pickLetters(index, 12, seededRng(3));
    expect(performance.now() - from).toBeLessThan(200);
    expect(set).toHaveLength(12);
  });

  it('dealOf on the real dictionary: «морквасті» and a set with no word', () => {
    const nouns = loadNouns();
    const index = letterIndexOf(nouns);
    const deal = dealOf(index, [...'морквасті']);
    expect(deal.best).toEqual(['комісар', 'самотік']);
    // Звірено з файлом словника: кожне слово ≥ 3 літер, що складається з набору.
    const expected = [...nouns.keys()].filter((key) => fitsLetters(key, [...'морквасті'])).length;
    expect(deal.possible).toBe(expected);
    expect(deal.possible).toBe(196);
    expect(dealOf(index, [...'бджжщ'])).toEqual({ best: [], possible: 0 });
  });

  it('pickLetters golden (30d)', () => {
    const index = letterIndexOf(SMALL);
    expect([1, 2, 3, 4, 5].map((s) => pickLetters(index, 9, seededRng(s)))).toMatchInlineSnapshot(`
      [
        [
          "к",
          "а",
          "о",
          "в",
          "і",
          "т",
          "м",
          "а",
          "с",
        ],
        [
          "к",
          "а",
          "м",
          "а",
          "р",
          "т",
          "о",
          "і",
          "с",
        ],
        [
          "о",
          "т",
          "к",
          "і",
          "с",
          "т",
          "а",
          "і",
          "м",
        ],
        [
          "м",
          "т",
          "і",
          "к",
          "р",
          "с",
          "о",
          "а",
          "о",
        ],
        [
          "с",
          "в",
          "а",
          "к",
          "і",
          "у",
          "о",
          "р",
          "м",
        ],
      ]
    `);
  });
});
