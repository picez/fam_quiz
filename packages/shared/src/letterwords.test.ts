import { describe, expect, it } from 'vitest';
import { LETTER_VOWELS, fitsLetters, letterSet, wordLetters } from './letterwords';

const set = (text: string) => letterSet(text)!;

describe('letter words rules (27d)', () => {
  it("letterSet normalises the host's letters", () => {
    expect(letterSet('М о, р-к в а с т і')).toEqual(['м', 'о', 'р', 'к', 'в', 'а', 'с', 'т', 'і']);
    expect(letterSet('abc')).toBeNull();
    expect(letterSet('кіт')).toBeNull();
    expect(letterSet('абвгдежзиклмн')).toBeNull();
    expect(letterSet("м'ясо")).toEqual(['м', 'я', 'с', 'о']);
    expect(letterSet('мяс1о')).toBeNull();
  });

  it('fitsLetters counts every letter', () => {
    expect(fitsLetters('морква', set('морквасті'))).toBe(true);
    expect(fitsLetters('мама', set('мамасо'))).toBe(true);
    expect(fitsLetters('мама', set('морквасті'))).toBe(false);
    expect(fitsLetters('ґава', set('гавоуклм'))).toBe(false);
    expect(fitsLetters("м'ясо", ['м', 'я', 'с', 'о'])).toBe(true);
  });

  it('wordLetters drops the apostrophe and the vowels are the Ukrainian ones', () => {
    expect(wordLetters("м'ясо")).toEqual(['м', 'я', 'с', 'о']);
    expect([...LETTER_VOWELS].sort()).toEqual([...'аеєиіїоуюя'].sort());
  });
});
