import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { answerText, correctText } from './format';

const base = { id: 'q', text: '?', imageUrl: null, timeLimit: 20, points: 1000 };
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
