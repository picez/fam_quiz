import { describe, expect, it } from 'vitest';
import { checkAnswer, paceFactor, paysForTime, shareVerdict, surveyHits, textMatches, verdictOf } from './check';
import type { Question } from '@quiz/shared';
import { bool, clues, match, multi, numeric, order, pin, single, slider, survey, text, withReveal } from './testing/fixtures';

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

describe('checkAnswer: slider', () => {
  const at = (value: number) => checkAnswer(slider, { type: 'slider', value });

  it('full inside the tolerance, linear to the zero distance, half the price is accepted', () => {
    expect(at(52)).toEqual(FULL);
    expect(at(48)).toEqual(FULL);
    expect(at(57).accepted).toBe(true);
    expect(at(57).accuracy).toBeCloseTo(0.5);
    expect(at(58).accepted).toBe(false);
    expect(at(58).accuracy).toBeCloseTo(0.4);
    expect(at(62)).toEqual(REJECTED);
  });

  it('rejects an answer of a different type and a value off the scale', () => {
    expect(checkAnswer(slider, { type: 'numeric', value: 50 })).toEqual(REJECTED);
    expect(at(101)).toEqual(REJECTED);
    expect(at(-1)).toEqual(REJECTED);
  });

  it('values at the ends of the scale are on it', () => {
    const edge: Question = { ...slider, correct: 0 };
    expect(checkAnswer(edge, { type: 'slider', value: 0 })).toEqual(FULL);
    expect(checkAnswer({ ...slider, correct: 100 }, { type: 'slider', value: 100 })).toEqual(FULL);
  });

  it('a fractional step and a zero tolerance: exactly half counts despite rounding', () => {
    const fine: Question = { ...slider, min: 0, max: 1, step: 0.05, correct: 0.7, tolerance: 0.1, zeroBeyond: 0.2 };
    expect(checkAnswer(fine, { type: 'slider', value: 0.8 })).toEqual(FULL);
    // 0.85 − 0.7 у двійковому трохи більше за 0.15: частка виходить 0.4999…
    const half = checkAnswer(fine, { type: 'slider', value: 0.85 });
    expect(half.accepted).toBe(true);
    expect(half.accuracy).toBeCloseTo(0.5);
    expect(checkAnswer(fine, { type: 'slider', value: 0.9 })).toEqual(REJECTED);
    const halves: Question = { ...slider, min: 0, max: 5, step: 0.5, correct: 2.5, tolerance: 0, zeroBeyond: 1 };
    expect(checkAnswer(halves, { type: 'slider', value: 3 }).accepted).toBe(true);
    expect(checkAnswer(halves, { type: 'slider', value: 3.5 })).toEqual(REJECTED);
  });
});

describe('verdictOf', () => {
  const right = { type: 'text', value: 'Одеса' } as const;
  const revealing = withReveal(text);

  it('a revealing picture multiplies the accuracy by the reveal share; correctness is the answer itself', () => {
    const early = verdictOf(revealing, right, 10_000);
    expect(early.accuracy).toBeCloseTo(0.65);
    expect(early).toMatchObject({ accepted: true, grade: 'correct' });
    const late = verdictOf(revealing, right, 15_000);
    expect(late.accuracy).toBeCloseTo(0.475);
    expect(late).toMatchObject({ accepted: true, grade: 'correct' });
    expect(verdictOf(revealing, { type: 'text', value: 'Київ' }, 0)).toEqual({ accepted: false, accuracy: 0, grade: 'wrong' });
  });

  it('a revealing number keeps its own partial grade', () => {
    const v = verdictOf(withReveal(numeric), { type: 'numeric', value: 2111 }, 10_000);
    expect(v.accuracy).toBeCloseTo(0.75 * 0.65);
    expect(v).toMatchObject({ accepted: true, grade: 'partial' });
  });

  it('a slider: half the price is correct, less is partial, zero is wrong', () => {
    expect(verdictOf(slider, { type: 'slider', value: 57 }, 0)).toMatchObject({ accepted: true, grade: 'correct' });
    expect(verdictOf(slider, { type: 'slider', value: 58 }, 0)).toMatchObject({ accepted: false, grade: 'partial' });
    expect(verdictOf(slider, { type: 'slider', value: 70 }, 0)).toEqual({ accepted: false, accuracy: 0, grade: 'wrong' });
  });

  it('old types keep their verdict', () => {
    expect(verdictOf(numeric, { type: 'numeric', value: 2111 }, 0)).toEqual({ accepted: true, accuracy: 0.75, grade: 'partial' });
    expect(verdictOf(single, { type: 'single', optionId: 'b' }, 19_000)).toEqual({ accepted: true, accuracy: 1, grade: 'correct' });
  });
});

describe('«Who am I?» and pin (10c)', () => {
  const right = { type: 'clues', value: ' тарас шевченко ' } as const;
  const at = (x: number, y = 0.5) => ({ type: 'pin', x, y }) as const;

  it('checkAnswer: «Who am I?» matches the spellings like a text', () => {
    expect(checkAnswer(clues, right)).toEqual(FULL);
    expect(checkAnswer(clues, { type: 'clues', value: 'Франко' })).toEqual(REJECTED);
    expect(checkAnswer(clues, { type: 'text', value: 'Шевченко' })).toEqual(REJECTED);
  });

  it('checkAnswer: a pin scores by distance, half is accepted', () => {
    const half = checkAnswer(pin, at(0.59));
    expect(half.accepted).toBe(true);
    expect(half.accuracy).toBeCloseTo(0.5);
    const quarter = checkAnswer(pin, at(0.62));
    expect(quarter.accepted).toBe(false);
    expect(quarter.accuracy).toBeCloseTo(0.25);
    expect(checkAnswer(pin, at(0.66))).toEqual(REJECTED);
    expect(checkAnswer(pin, { type: 'slider', value: 50 })).toEqual(REJECTED);
  });

  it('verdictOf: «Who am I?» pays by the clue and stays correct', () => {
    expect(verdictOf(clues, right, 5000)).toEqual({ accepted: true, accuracy: 0.8, grade: 'correct' });
    expect(verdictOf(clues, right, 0, 4)).toMatchObject({ accepted: true, accuracy: 0.4, grade: 'correct' });
    expect(verdictOf(clues, { type: 'clues', value: 'Франко' }, 5000)).toEqual({ accepted: false, accuracy: 0, grade: 'wrong' });
  });

  it('verdictOf: a pin below half is partial', () => {
    expect(verdictOf(pin, at(0.62), 0)).toMatchObject({ accepted: false, grade: 'partial' });
    expect(verdictOf(pin, at(0.59), 0)).toMatchObject({ accepted: true, grade: 'correct' });
  });

  it('paysForTime: a revealing picture and «Who am I?»', () => {
    expect(paysForTime(clues)).toBe(true);
    expect(paysForTime(withReveal(text))).toBe(true);
    expect(paysForTime(pin)).toBe(false);
    expect(paysForTime(slider)).toBe(false);
    expect(paysForTime(text)).toBe(false);
  });

  it('paceFactor: the clue share, the reveal share, otherwise 1', () => {
    expect(paceFactor(clues, 12_000)).toBeCloseTo(0.6);
    expect(paceFactor(clues, 12_000, 1)).toBe(1);
    expect(paceFactor(withReveal(text), 20_000)).toBeCloseTo(0.3);
    expect(paceFactor(pin, 20_000)).toBe(1);
  });
});

describe('shareVerdict', () => {
  it('half the price or more is correct, less is partial, nothing is wrong', () => {
    expect(shareVerdict(0.5)).toEqual({ accepted: true, accuracy: 0.5, grade: 'correct' });
    expect(shareVerdict(0.75)).toEqual({ accepted: true, accuracy: 0.75, grade: 'correct' });
    expect(shareVerdict(0.25)).toEqual({ accepted: false, accuracy: 0.25, grade: 'partial' });
    expect(shareVerdict(0)).toEqual({ accepted: false, accuracy: 0, grade: 'wrong' });
    expect(shareVerdict(0.4999999999)).toMatchObject({ accepted: true, grade: 'correct' });
  });
});

describe('«100 to 1» survey (10e)', () => {
  it('surveyHits: normalized like text, the first matching row, a row already hit is null', () => {
    expect(surveyHits(survey.rows, [' ЯБЛУЧКО ', 'Яблуко', 'банан', 'ананас'])).toEqual(['sa', null, 'sb', null]);
    expect(surveyHits(survey.rows, ['', '  '])).toEqual([null, null]);
    expect(surveyHits(survey.rows, ['«Кавун»'])).toEqual([null]);
  });

  it('checkAnswer: the share of the price from distinct hit rows; half is accepted', () => {
    const both = checkAnswer(survey, { type: 'survey', values: ['Яблуко', 'Банан'] });
    expect(both.accepted).toBe(true);
    expect(both.accuracy).toBeCloseTo(0.57);
    const one = checkAnswer(survey, { type: 'survey', values: ['Кавун'] });
    expect(one.accepted).toBe(false);
    expect(one.accuracy).toBeCloseTo(0.1);
    expect(checkAnswer(survey, { type: 'survey', values: [] })).toEqual(REJECTED);
    expect(checkAnswer(survey, { type: 'text', value: 'Яблуко' })).toEqual(REJECTED);
  });

  it('checkAnswer: multiple divides by the total of all rows when it passes 100', () => {
    // Разом 60 + 50 + 40 + 30 + 20 = 200.
    const rows = survey.rows.map((r, i) => ({ ...r, popularity: [60, 50, 40, 30, 20][i] }));
    const many = { ...survey, multiple: true, rows };
    expect(checkAnswer(many, { type: 'survey', values: ['Яблуко', 'Банан'] })).toEqual({ accepted: true, accuracy: 110 / 200 });
    expect(checkAnswer(many, { type: 'survey', values: ['Кавун', 'Груша'] }).accuracy).toBeCloseTo(0.25);
    expect(checkAnswer({ ...many, multiple: false }, { type: 'survey', values: ['Яблуко', 'Банан'] }).accuracy).toBe(1);
    // Сума до 100 — так само, як без прапорця.
    expect(checkAnswer({ ...survey, multiple: true }, { type: 'survey', values: ['Яблуко', 'Банан'] }).accuracy).toBeCloseTo(0.57);
  });

  it('verdictOf: a survey is graded by its share', () => {
    expect(verdictOf(survey, { type: 'survey', values: ['Яблуко', 'Банан'] }, 40_000)).toMatchObject({ accepted: true, grade: 'correct' });
    expect(verdictOf(survey, { type: 'survey', values: ['Кавун'] }, 0)).toMatchObject({ accepted: false, grade: 'partial' });
    expect(verdictOf(survey, { type: 'survey', values: ['ананас'] }, 0)).toEqual({ accepted: false, accuracy: 0, grade: 'wrong' });
  });
});
