import { describe, expect, it } from 'vitest';
import { emptyBrief, type Question, type RoundInfo } from '@quiz/shared';
import { questionLabel, roundFacts, roundLabel, answerText, choicesOf, correctPairs, correctText, formatDate, orderLabelsText, pairTexts, secondsText, shownChoices } from './format';

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

describe('order labels', () => {
  it('order labels in words and in the revealed answer', () => {
    expect(orderLabelsText({ top: 'Найбільший', bottom: 'Найменший' })).toBe('зверху — Найбільший, знизу — Найменший');
    expect(orderLabelsText({ top: '', bottom: 'Найменший' })).toBe('знизу — Найменший');
    expect(orderLabelsText({ top: '', bottom: '' })).toBe('');
    expect(correctText({ ...order, topLabel: 'Захід', bottomLabel: 'Схід' })).toBe('Львів → Київ → Одеса (зверху — Захід, знизу — Схід)');
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

const info = (type: RoundInfo['type'], total = 1, times: RoundInfo['times'] = null): RoundInfo => ({
  index: 0, total, title: '', type, partial: false, description: '', brief: emptyBrief(type), times,
});

describe('round facts and the question label', () => {
  it('round facts: the count and the time per question', () => {
    expect(roundFacts(info('classic', 1, { min: 30, max: 60 }), 10)).toBe('10 запитань · 30–60 с на кожне');
    expect(roundFacts(info('blitz', 1, { min: 20, max: 20 }), 1)).toBe('1 запитання · 20 с на кожне');
    expect(roundFacts(info('classic', 1, null), 3)).toBe('3 запитання · без таймера');
    expect(roundFacts(info('board', 1, { min: 20, max: 20 }), 24)).toBe('24 клітинки · 20 с на кожну');
    expect(roundFacts(info('board', 1, { min: 20, max: 40 }), 25)).toBe('25 клітинок · 20–40 с на кожну');
    expect(roundFacts(info('final', 1, { min: 30, max: 30 }), 1)).toBeNull();
  });

  it('the question label says how many are left', () => {
    expect(questionLabel(info('classic'), 2, 10)).toBe('Запитання 3 з 10 · лишилося 7');
    expect(questionLabel(info('classic'), 9, 10)).toBe('Запитання 10 з 10 · останнє');
    expect(questionLabel(info('board'), 4, 24)).toBe('Клітинка 5 з 24 · лишилося 19');
    expect(questionLabel(info('board'), 23, 24)).toBe('Клітинка 24 з 24 · остання');
    expect(questionLabel({ ...info('classic', 3), index: 1 }, 1, 5)).toBe('Запитання 2 з 5 · лишилося 3 · Раунд 2');
    expect(questionLabel({ ...info('final', 3), index: 2 }, 0, 1)).toBe('Запитання 1 з 1 · Раунд 3');
    expect(questionLabel(null, 0, 3)).toBe('Запитання 1 з 3 · лишилося 2');
  });
});
