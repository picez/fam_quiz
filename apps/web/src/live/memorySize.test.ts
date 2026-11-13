import { describe, expect, it } from 'vitest';
import { memoryCardSize } from './memorySize';

describe('memoryCardSize', () => {
  it('takes the width limit when the height is plentiful', () => {
    expect(memoryCardSize({ width: 296, height: 800, cols: 4, rows: 5, gap: 6 })).toBe(69);
  });

  it('takes the height limit when it is the tighter one', () => {
    // (300 - 4 * 6) / 5 = 55.2
    expect(memoryCardSize({ width: 296, height: 300, cols: 4, rows: 5, gap: 6 })).toBe(55);
  });

  it('never goes below the readable minimum because of height', () => {
    expect(memoryCardSize({ width: 296, height: 120, cols: 4, rows: 5, gap: 6 })).toBe(52);
    expect(memoryCardSize({ width: 296, height: -50, cols: 4, rows: 5, gap: 6 })).toBe(52);
  });

  it('still obeys the width when it is narrower than the minimum', () => {
    expect(memoryCardSize({ width: 150, height: 100, cols: 4, rows: 4, gap: 6 })).toBe(33);
  });

  it('a longer title (less height) gives a smaller card on 320x568', () => {
    const one = memoryCardSize({ width: 296, height: 568 - 205 - 20, cols: 4, rows: 5, gap: 6 });
    const three = memoryCardSize({ width: 296, height: 568 - 205 - 20 - 44, cols: 4, rows: 5, gap: 6 });
    expect(three).toBeLessThan(one);
    expect(three).toBeGreaterThanOrEqual(52);
  });
});
