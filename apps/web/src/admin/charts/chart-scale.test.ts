import { describe, expect, it } from 'vitest';
import { addDays, bucketLabel, bucketRange, compactNumber, deltaPercent, minutesText, niceTicks, percentText, xLabelIndexes } from './chart-scale';

describe('niceTicks', () => {
  it('keeps a flat axis for zeros', () => {
    expect(niceTicks(0, 3)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it('picks the smallest nice step that fits the interval count', () => {
    expect(niceTicks(7, 3)).toEqual({ max: 8, ticks: [0, 4, 8] });
    expect(niceTicks(93, 5).ticks).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(93, 5).max).toBe(100);
    expect(niceTicks(1, 3)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceTicks(1234, 5).max).toBeGreaterThanOrEqual(1234);
  });

  it('gives whole ticks for fractional averages', () => {
    expect(niceTicks(2.4, 3).ticks).toEqual([0, 1, 2, 3]);
    expect(niceTicks(2.4, 5).ticks).toEqual([0, 1, 2, 3]);
  });

  it('always scales percentages to 100', () => {
    expect(niceTicks(100, 5, { percent: true })).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceTicks(12, 5, { percent: true }).max).toBe(100);
    expect(niceTicks(40, 3, { percent: true }).ticks).toEqual([0, 50, 100]);
  });
});

describe('xLabelIndexes', () => {
  it('labels the first and the last bar and keeps labels apart', () => {
    const indexes = xLabelIndexes(30, 300, 56);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(29);
    const slot = 300 / 30;
    for (let index = 1; index < indexes.length; index++) expect((indexes[index]! - indexes[index - 1]!) * slot).toBeGreaterThanOrEqual(56);
  });

  it('labels a single bar', () => {
    expect(xLabelIndexes(1, 300, 56)).toEqual([0]);
    expect(xLabelIndexes(0, 300, 56)).toEqual([]);
  });

  it('labels every bar when there is room', () => {
    // 24 години на широкому діалозі: 1400 / 24 ≈ 58 px на стовпчик.
    expect(xLabelIndexes(24, 1400, 56)).toEqual(Array.from({ length: 24 }, (_, index) => index));
    // Короткі підписи годин («09») дозволяють менший проміжок.
    expect(xLabelIndexes(24, 900, 32)).toHaveLength(24);
  });
});

describe('numbers and periods', () => {
  it('formats numbers, minutes and percentages in uk', () => {
    // Intl ставить нерозривний пробіл.
    expect(compactNumber(1234).replace(/\s/g, ' ')).toBe('1,2 тис.');
    expect(compactNumber(12)).toBe('12');
    expect(minutesText(80)).toBe('1 год 20 хв');
    expect(minutesText(45)).toBe('45 хв');
    expect(minutesText(44.6)).toBe('45 хв');
    expect(percentText(50)).toBe('50 %');
    expect(percentText(12.34)).toBe('12,3 %');
  });

  it('counts the change to the previous period', () => {
    expect(deltaPercent(110, 100)).toBe(10);
    expect(deltaPercent(90, 100)).toBe(-10);
    expect(deltaPercent(5, 0)).toBeNull();
    expect(deltaPercent(null, 4)).toBeNull();
    expect(deltaPercent(4, null)).toBeNull();
  });

  it('labels days and weeks', () => {
    expect(bucketLabel('2026-11-19', 'day')).toBe('19 лист.');
    expect(bucketLabel('2026-11-17', 'week')).toBe('з 17 лист.');
    expect(bucketRange('2026-11-19', 1)).toBe('19 лист.');
    expect(bucketRange('2026-11-17', 7)).toBe('17 лист. – 23 лист.');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});
