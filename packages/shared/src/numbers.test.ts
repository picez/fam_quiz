import { describe, expect, it } from 'vitest';
import { clamp, clamp01 } from './numbers';
import { seededRng } from './random';

describe('numbers (30d)', () => {
  it('clamp keeps values inside the bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(Number.isNaN(clamp(NaN, 0, 1))).toBe(true);
  });

  it('reversed bounds give max, as Math.min(max, Math.max(min, v)) does', () => {
    expect(clamp(5, 10, 0)).toBe(0);
  });

  it('clamp01', () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(2)).toBe(1);
  });

  it('clamp equals Math.min(hi, Math.max(lo, v)) for random triples', () => {
    const rng = seededRng(1);
    const draw = () => rng() * 20 - 10;
    for (let k = 0; k < 1000; k++) {
      const v = draw();
      const lo = draw();
      const hi = draw();
      expect(clamp(v, lo, hi)).toBe(Math.min(hi, Math.max(lo, v)));
    }
  });
});
