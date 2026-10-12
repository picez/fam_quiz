import { describe, expect, it } from 'vitest';
import { scorePoints, speedFactor } from './score';

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
