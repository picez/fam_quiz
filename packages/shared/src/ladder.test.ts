import { describe, expect, it } from 'vitest';
import { LADDER_PRESETS, hallPoints, ladderPresetSafe, ladderPrize } from './index';

describe('ladder presets', () => {
  it('cover 5…15 steps, rise strictly from 100 to 10 000', () => {
    expect(Object.keys(LADDER_PRESETS).map(Number)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    for (const [n, levels] of Object.entries(LADDER_PRESETS)) {
      expect(levels).toHaveLength(Number(n));
      expect(levels[0]).toBe(100);
      expect(levels.at(-1)).toBe(10000);
      levels.forEach((l, i) => i > 0 && expect(l).toBeGreaterThan(levels[i - 1]));
    }
    expect(LADDER_PRESETS[5]).toEqual([100, 300, 1000, 3000, 10000]);
  });
  it('picks safe steps at the first 1000 and the first 5000, never the top', () => {
    expect(ladderPresetSafe([100, 300, 1000, 3000, 10000])).toEqual([2]);
    expect(ladderPresetSafe(LADDER_PRESETS[7])).toEqual([3, 5]);
    expect(ladderPresetSafe([100, 10000])).toEqual([]);
  });
});

describe('ladderPrize', () => {
  const levels = [100, 300, 1000, 3000, 10000];
  it('pays the last passed level for took, top and stopped, and the highest passed safe level for wrong', () => {
    expect(ladderPrize(levels, [2], 0, 'took')).toBe(0);
    expect(ladderPrize(levels, [2], 3, 'took')).toBe(1000);
    expect(ladderPrize(levels, [2], 5, 'top')).toBe(10000);
    expect(ladderPrize(levels, [2], 4, 'wrong')).toBe(1000);
    expect(ladderPrize(levels, [2], 2, 'wrong')).toBe(0);
    expect(ladderPrize(levels, [2], 3, 'wrong')).toBe(1000);
    expect(ladderPrize(levels, [2], 4, 'stopped')).toBe(3000);
  });
});

describe('hallPoints', () => {
  it('is 10 % of the level, rounded', () => {
    expect(hallPoints(1000)).toBe(100);
    expect(hallPoints(250)).toBe(25);
    expect(hallPoints(150)).toBe(15);
    expect(hallPoints(5)).toBe(1);
  });
});
