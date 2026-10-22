import { describe, expect, it } from 'vitest';
import { answerPoints, chainFactor, scorePoints, speedFactor, streakBonus } from './score';

describe('speedFactor', () => {
  it('is 1 when the speed bonus is off', () => {
    expect(speedFactor(19_000, 20_000, false)).toBe(1);
  });

  it('falls linearly from 1 to 0.5 over the time limit', () => {
    expect(speedFactor(0, 20_000, true)).toBe(1);
    expect(speedFactor(10_000, 20_000, true)).toBe(0.75);
    expect(speedFactor(20_000, 20_000, true)).toBe(0.5);
  });

  it('stays within 0.5–1 for times outside the limit', () => {
    expect(speedFactor(-500, 20_000, true)).toBe(1);
    expect(speedFactor(99_000, 20_000, true)).toBe(0.5);
  });
});

describe('scorePoints', () => {
  it('multiplies points by accuracy and speed and rounds', () => {
    expect(scorePoints(1000, 1, 1)).toBe(1000);
    expect(scorePoints(1000, 0.75, 0.75)).toBe(563);
    expect(scorePoints(1000, 0, 1)).toBe(0);
  });
});

describe('answerPoints', () => {
  const base = { points: 1000, accuracy: 1, speed: 1, multiplier: 1, penalty: 'none' } as const;

  it('applies the round multiplier to points', () => {
    expect(answerPoints({ ...base, speed: 0.75, multiplier: 2 })).toBe(1500);
  });

  it('takes the penalty for a wrong answer, multiplied', () => {
    expect(answerPoints({ ...base, points: 200, accuracy: 0, penalty: 'minus', multiplier: 3 })).toBe(-600);
  });

  it('gives 0 for a wrong answer without a penalty', () => {
    expect(answerPoints({ ...base, accuracy: 0 })).toBe(0);
  });

  it('does not penalize a partial answer', () => {
    expect(answerPoints({ ...base, accuracy: 0.5, penalty: 'minus' })).toBe(500);
  });
});

describe('streakBonus', () => {
  it('is a percent of the base points', () => {
    expect(streakBonus(1500, { kind: 'percent', value: 50 })).toBe(750);
  });

  it('is a fixed amount', () => {
    expect(streakBonus(1500, { kind: 'fixed', value: 100 })).toBe(100);
  });
});

describe('chainFactor', () => {
  it('chain factor is 1 for the fastest, linear to a half at the limit', () => {
    expect(chainFactor(5000, 5000, 20000)).toBe(1);
    expect(chainFactor(20000, 5000, 20000)).toBe(0.5);
    expect(chainFactor(12500, 5000, 20000)).toBeCloseTo(0.75);
    expect(chainFactor(20000, 20000, 20000)).toBe(1);
  });
});
