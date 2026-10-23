import { describe, expect, it } from 'vitest';
import { checkAnswer, textMatches } from './check';
import { bool, match, multi, numeric, order, single, text } from './testing/fixtures';

const REJECTED = { accepted: false, accuracy: 0 };
const FULL = { accepted: true, accuracy: 1 };

describe('checkAnswer', () => {
  it('rejects an answer of a different type', () => {
    expect(checkAnswer(single, { type: 'boolean', value: true })).toEqual(REJECTED);
  });

  it('single: accepts only the correct option', () => {
    expect(checkAnswer(single, { type: 'single', optionId: 'b' })).toEqual(FULL);
    expect(checkAnswer(single, { type: 'single', optionId: 'a' })).toEqual(REJECTED);
  });

  it('multi: accepts the exact set in any order', () => {
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['c', 'a'] })).toEqual(FULL);
  });

  it('multi: rejects a subset, a superset and unknown ids', () => {
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a'] })).toEqual(REJECTED);
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a', 'b', 'c'] })).toEqual(REJECTED);
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a', 'c', 'zzz'] })).toEqual(REJECTED);
  });

  it('multi: rejects repeated ids in the answer', () => {
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a', 'a', 'c'] })).toEqual(REJECTED);
  });

  it('boolean: compares the value', () => {
    expect(checkAnswer(bool, { type: 'boolean', value: true })).toEqual(FULL);
    expect(checkAnswer(bool, { type: 'boolean', value: false })).toEqual(REJECTED);
  });

  it('text: compares after normalization', () => {
    expect(checkAnswer(text, { type: 'text', value: '  ОДЕСА ' })).toEqual(FULL);
    expect(checkAnswer(text, { type: 'text', value: 'Адеса' })).toEqual(REJECTED);
  });

  it('text: rejects an empty answer', () => {
    expect(checkAnswer(text, { type: 'text', value: '   ' })).toEqual(REJECTED);
  });

  it('text: accepts a typographic apostrophe', () => {
    const question = { ...text, accepted: ["Кам'янець-Подільський"] };
    expect(checkAnswer(question, { type: 'text', value: 'кам’янець-подільський' })).toEqual(FULL);
  });

  it('numeric: full accuracy for the exact value, half at the tolerance edge', () => {
    expect(checkAnswer(numeric, { type: 'numeric', value: 2061 })).toEqual(FULL);
    expect(checkAnswer(numeric, { type: 'numeric', value: 2111 })).toEqual({ accepted: true, accuracy: 0.75 });
    expect(checkAnswer(numeric, { type: 'numeric', value: 1961 })).toEqual({ accepted: true, accuracy: 0.5 });
  });

  it('numeric: rejects a value outside the tolerance', () => {
    expect(checkAnswer(numeric, { type: 'numeric', value: 2162 })).toEqual(REJECTED);
  });

  it('numeric: with zero tolerance accepts only the exact value', () => {
    const exact = { ...numeric, tolerance: 0 };
    expect(checkAnswer(exact, { type: 'numeric', value: 2061 })).toEqual(FULL);
    expect(checkAnswer(exact, { type: 'numeric', value: 2062 })).toEqual(REJECTED);
  });

  it('numeric: tolerates floating point error', () => {
    const exact = { ...numeric, correct: 0.3, tolerance: 0 };
    expect(checkAnswer(exact, { type: 'numeric', value: 0.1 + 0.2 })).toEqual(FULL);
  });

  it('order: accuracy is the share of items in place', () => {
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'l', 'k', 'h'] })).toEqual(FULL);
    expect(checkAnswer(order, { type: 'order', itemIds: ['l', 'u', 'k', 'h'] })).toEqual({
      accepted: false,
      accuracy: 0.5,
    });
    expect(checkAnswer(order, { type: 'order', itemIds: ['h', 'k', 'l', 'u'] })).toEqual(REJECTED);
  });

  it('order: rejects repeated, missing or unknown ids without partial credit', () => {
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'u', 'k', 'h'] })).toEqual(REJECTED);
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'l', 'k'] })).toEqual(REJECTED);
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'l', 'k', 'zzz'] })).toEqual(REJECTED);
  });

  it('match: all pairs right in any link order is fully correct', () => {
    expect(checkAnswer(match, { type: 'match', links: [{ left: 'c', right: 'z' }, { left: 'a', right: 'x' }, { left: 'b', right: 'y' }] })).toEqual(FULL);
  });

  it('match: one swapped pair makes the whole answer wrong', () => {
    expect(checkAnswer(match, { type: 'match', links: [{ left: 'a', right: 'y' }, { left: 'b', right: 'x' }, { left: 'c', right: 'z' }] })).toEqual(REJECTED);
  });

  it('match: duplicate, unknown or missing links are wrong', () => {
    const links = (...pairs: [string, string][]) => ({ type: 'match' as const, links: pairs.map(([left, right]) => ({ left, right })) });
    expect(checkAnswer(match, links(['a', 'x'], ['a', 'x'], ['c', 'z']))).toEqual(REJECTED);
    expect(checkAnswer(match, links(['a', 'x'], ['b', 'x'], ['c', 'z']))).toEqual(REJECTED);
    expect(checkAnswer(match, links(['a', 'x'], ['b', 'y'], ['c', 'zzz']))).toEqual(REJECTED);
    expect(checkAnswer(match, links(['a', 'x'], ['b', 'y']))).toEqual(REJECTED);
    expect(checkAnswer(match, links(['a', 'x'], ['b', 'y'], ['c', 'z'], ['a', 'x']))).toEqual(REJECTED);
  });

  it('textMatches: any spelling after normalizing, never an empty answer', () => {
    expect(textMatches(['Залізо', 'Ферум'], ' ферум ')).toBe(true);
    expect(textMatches(['Залізо'], 'Мідь')).toBe(false);
    expect(textMatches(['Залізо'], '')).toBe(false);
    expect(textMatches(['Залізо'], '   ')).toBe(false);
  });
});
