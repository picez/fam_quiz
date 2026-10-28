import { describe, expect, it } from 'vitest';
import { RESUME_POINTS_MAX, startSchema } from './index';

describe('start payload (12r)', () => {
  it('accepts a round and integer points within ±9 999 999, and an empty start', () => {
    expect(startSchema.safeParse({}).success).toBe(true);
    expect(startSchema.safeParse({ resume: { roundIndex: 2, points: { p1: 42_434, p2: -150, p3: 0 } } }).success).toBe(true);
    expect(startSchema.safeParse({ resume: { roundIndex: 0, points: { p1: RESUME_POINTS_MAX, p2: -RESUME_POINTS_MAX } } }).success).toBe(true);
  });

  it('refuses fractions, values out of range, a negative round and extra keys', () => {
    for (const resume of [
      { roundIndex: 0, points: { p1: 1.5 } },
      { roundIndex: 0, points: { p1: RESUME_POINTS_MAX + 1 } },
      { roundIndex: -1, points: {} },
      { roundIndex: 10, points: {} },
      { roundIndex: 0, points: {}, extra: 1 },
    ]) expect(startSchema.safeParse({ resume }).success).toBe(false);
    expect(startSchema.safeParse({ resume: { roundIndex: 0, points: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`p${i}`, 1])) } }).success).toBe(false);
  });
});
