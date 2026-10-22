import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { roundLabel, answerText, choicesOf, correctPairs, correctText, formatDate, pairTexts, secondsText, shownChoices } from './format';

const base = { id: 'q', text: '?', imageUrl: null, video: null, timeLimit: 20, points: 1000 };
const options = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
  { id: 'c', text: 'Одеса' },
];
const single: Question = { ...base, type: 'single', options, correctId: 'b' };
const multi: Question = { ...base, type: 'multi', options, correctIds: ['a', 'c'] };
const bool: Question = { ...base, type: 'boolean', correct: false };
const text: Question = { ...base, type: 'text', accepted: ['Одеса', 'Одесса'] };
const numeric: Question = { ...base, type: 'numeric', correct: 2061, tolerance: 100 };
const order: Question = { ...base, type: 'order', items: options };

describe('correctText', () => {
  it('describes the correct answer of every question type', () => {
    expect(correctText(single)).toBe('B. Київ');
    expect(correctText(multi)).toBe('A. Львів, C. Одеса');
    expect(correctText(bool)).toBe('Ні');
    expect(correctText(text)).toBe('Одеса');
    expect(correctText(numeric)).toBe('2061 (± 100)');
    expect(correctText({ ...numeric, tolerance: 0 })).toBe('2061');
    expect(correctText(order)).toBe('Львів → Київ → Одеса');
  });
});

describe('answerText', () => {
  it('describes a player answer using the question options', () => {
    expect(answerText({ type: 'single', optionId: 'c' }, single)).toBe('Одеса');
    expect(answerText({ type: 'multi', optionIds: ['c', 'a'] }, multi)).toBe('Одеса, Львів');
    expect(answerText({ type: 'boolean', value: true }, bool)).toBe('Так');
    expect(answerText({ type: 'text', value: 'Адеса' }, text)).toBe('Адеса');
    expect(answerText({ type: 'numeric', value: 2000.5 }, numeric)).toBe('2000.5');
    expect(answerText({ type: 'order', itemIds: ['c', 'a', 'b'] }, order)).toBe('Одеса → Львів → Київ');
  });

  it('falls back to ids when the option is unknown or the question is missing', () => {
    expect(answerText({ type: 'single', optionId: 'zzz' }, single)).toBe('zzz');
    expect(answerText({ type: 'single', optionId: 'a' }, null)).toBe('a');
  });
});

describe('correctText with a presented order', () => {
  it('uses the letters players actually see when options were shuffled', () => {
    const presented = [{ id: 'b' }, { id: 'c' }, { id: 'a' }];
    expect(correctText(single, presented)).toBe('A. Київ');
    expect(correctText(multi, presented)).toBe('B. Одеса, C. Львів');
  });
});

describe('formatDate', () => {
  it('shows the day, the month in words and the time', () => {
    const text = formatDate('2026-10-12T15:30:00.000Z');
    expect(text).toMatch(/\d{1,2} жовт/);
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns an empty string for something that is not a date', () => {
    expect(formatDate('не дата')).toBe('');
  });
});

describe('match questions', () => {
  const pair = (l: string, lt: string, r: string, rt: string) => ({ left: { id: l, text: lt }, right: { id: r, text: rt } });
  const matchQ: Question = {
    ...base,
    type: 'match',
    pairs: [pair('a', 'Київ', 'x', 'Дніпро'), pair('b', 'Львів', 'y', 'Полтва'), pair('c', 'Ужгород', 'z', 'Уж')],
  };

  it('writes match answers and the correct pairs as pairs', () => {
    expect(correctText(matchQ)).toBe('Київ — Дніпро; Львів — Полтва; Ужгород — Уж');
    expect(answerText({ type: 'match', links: [{ left: 'b', right: 'x' }, { left: 'a', right: 'y' }] }, matchQ)).toBe('Львів — Дніпро; Київ — Полтва');
    expect(pairTexts([{ left: 'a', right: '??' }], choicesOf(matchQ))).toEqual([{ left: 'Київ', right: '??' }]);
    expect(correctPairs(matchQ)[1]).toEqual({ left: 'Львів', right: 'Полтва' });
    expect(correctPairs(single)).toEqual([]);
  });

  it('lists the left and right items as shown choices', () => {
    const shown = shownChoices({ choices: [{ id: 'a', text: 'Київ' }], right: [{ id: 'x', text: 'Дніпро' }] } as never);
    expect(shown.map((c) => c.id)).toEqual(['a', 'x']);
  });
});

it('an untitled final round is called «Фінал»', () => {
  expect(roundLabel('', 3, 'final')).toBe('Фінал');
  expect(roundLabel('Космос', 3, 'final')).toBe('Космос');
});

describe('chain texts', () => {
  const chainQ: Question = { ...base, type: 'chain', words: ['Форель', 'Риба', 'Океан', 'Корабель'], hintSeconds: 5 };
  it('writes the chain and chain answers in words', () => {
    expect(correctText(chainQ)).toBe('Форель → Риба → Океан → Корабель');
    expect(answerText({ type: 'chain', solved: 3, hints: 1, timeMs: 23_400 }, chainQ)).toBe('Пройдено за 23,4 с, підказок: 1');
    expect(answerText({ type: 'chain', solved: 1, hints: 0, timeMs: 20_000 }, chainQ)).toBe('Слів: 1 з 3');
    expect(answerText({ type: 'chain', solved: 1, hints: 0, timeMs: 20_000 }, null)).toBe('Слів: 1');
    expect(secondsText(5000)).toBe('5,0');
  });
});
