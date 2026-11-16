import { describe, expect, it } from 'vitest';
import type { ThinkWord } from '@quiz/shared';
import { thinkHit } from './think';

const words: ThinkWord[] = [
  { word: 'червоний', synonyms: ['багряний'] },
  { word: 'синій', synonyms: ['блакитний'] },
  { word: 'фіолетовий', synonyms: [] },
];
const one = (word: string): ThinkWord[] => [{ word, synonyms: [] }];

describe('think soft match (35)', () => {
  it('endings, apostrophes and case match', () => {
    expect(thinkHit(words, 'Фіолетова')).toBe(2);
    expect(thinkHit(words, 'фіолетові')).toBe(2);
    expect(thinkHit(words, ' ЧЕРВОНІ ')).toBe(0);
    expect(thinkHit(words, 'Багряна')).toBe(0);
    expect(thinkHit(words, 'Блакитна')).toBe(1);
    expect(thinkHit(one("п'ять"), 'пʼять')).toBe(0);
    expect(thinkHit(one("п'ять"), 'пять')).toBe(0);
  });

  it('typos do not save you', () => {
    expect(thinkHit(words, 'червониий')).toBe(0);
    expect(thinkHit(words, 'фиолетовий')).toBe(2);
    expect(thinkHit(one('горобець'), 'горобці')).toBe(0);
  });

  it('other words are safe', () => {
    for (const value of ['зелений', 'жовтий', 'оранжевий']) expect(thinkHit(words, value)).toBeNull();
  });

  it('short words keep their stem', () => {
    expect(thinkHit(one('кіт'), 'кит')).toBeNull();
    expect(thinkHit(one('ліс'), 'ліси')).toBe(0);
    expect(thinkHit(one('ліс'), 'Ліс')).toBe(0);
  });

  it('digits need an exact match', () => {
    expect(thinkHit(one('7'), '8')).toBeNull();
    expect(thinkHit(one('7'), '7')).toBe(0);
  });

  it('empty is no hit', () => {
    expect(thinkHit(words, '')).toBeNull();
    expect(thinkHit(words, '   ')).toBeNull();
  });

  it('no words — nobody hits', () => {
    expect(thinkHit([], 'червоний')).toBeNull();
  });

  it('the first matching word wins', () => {
    expect(thinkHit([{ word: 'море', synonyms: [] }, { word: 'морем', synonyms: [] }], 'моря')).toBe(0);
  });
});
