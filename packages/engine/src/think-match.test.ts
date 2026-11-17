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

  it('typos do not save you in long words', () => {
    expect(thinkHit(words, 'фиолетовий')).toBe(2);
    expect(thinkHit(words, 'фіолетоовий')).toBe(2);
    expect(thinkHit(words, 'блакитниий')).toBe(1);
    expect(thinkHit(one('горобець'), 'горобці')).toBe(0);
  });

  it('short stems match exactly: near words are other words', () => {
    expect(thinkHit(one('банан'), 'баран')).toBeNull();
    expect(thinkHit(one('яблуко'), 'яблуня')).toBeNull();
    expect(thinkHit(one('вулик'), 'вулиця')).toBeNull();
    expect(thinkHit(one('кошик'), 'кішка')).toBeNull();
    expect(thinkHit(words, 'червониий')).toBeNull();
  });

  it('punctuation, quotes and dashes do not matter', () => {
    for (const value of ['Червоний!', 'червоний.', '"Червоний"', '«червоний»', 'червоний , ']) expect(thinkHit(words, value)).toBe(0);
    const navy = one('темно-синій');
    for (const value of ['темно синій', 'темно–синій', 'Темно-сині']) expect(thinkHit(navy, value)).toBe(0);
  });

  it('a one-word host word matches any word of the answer; a longer one only the whole answer', () => {
    expect(thinkHit(words, 'дуже червоний')).toBe(0);
    expect(thinkHit(words, 'червоний колір')).toBe(0);
    expect(thinkHit(one('темно синій'), 'темно')).toBeNull();
    expect(thinkHit(one('темно синій'), 'синій темно')).toBeNull();
    expect(thinkHit(one('темно синій'), 'дуже темно синій')).toBeNull();
    expect(thinkHit(one('темно синій'), 'темно-синя')).toBe(0);
  });

  it('soft adjective forms', () => {
    expect(thinkHit(words, 'синьою')).toBe(1);
    expect(thinkHit(words, 'синьої')).toBe(1);
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
