import { describe, expect, it } from 'vitest';
import { addDays, bucketLabel, bucketRange, compactNumber, deltaPercent, deltaPoints, minutesText, niceTicks, percentText, pointsText, textWidth, xLabelLayout, type XLabel } from './chart-scale';

describe('niceTicks', () => {
  it('keeps a flat axis for zeros', () => {
    expect(niceTicks(0, 3)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it('keeps a flat axis for infinity and NaN instead of looping forever', () => {
    expect(niceTicks(Infinity, 3)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceTicks(NaN, 3)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceTicks(-5, 3)).toEqual({ max: 1, ticks: [0, 1] });
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

/** Рамки підписів так, як їх малює SVG: start — від x праворуч, end — від x ліворуч, middle — навпіл. */
const boxes = (labels: XLabel[], width: number) =>
  labels.map(({ x, anchor }) => (anchor === 'start' ? [x, x + width] : anchor === 'end' ? [x - width, x] : [x - width / 2, x + width / 2]) as [number, number]);
function expectApart(labels: XLabel[], labelWidth: number, plot: number) {
  const list = boxes(labels, labelWidth);
  for (const [left, right] of list) {
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(plot);
  }
  for (let i = 1; i < list.length; i++) expect(list[i]![0] - list[i - 1]![1], `labels ${i - 1} and ${i}`).toBeGreaterThanOrEqual(6);
}

describe('xLabelLayout', () => {
  it('labels the first and the last bar, inside the plot, and keeps label boxes apart', () => {
    const labels = xLabelLayout(30, 300, 50, 56);
    expect(labels[0]).toMatchObject({ index: 0, anchor: 'start', x: 0 });
    expect(labels.at(-1)).toMatchObject({ index: 29, anchor: 'end', x: 300 });
    expectApart(labels, 50, 300);
  });

  it('the anchored ends get clearance from their neighbours: 30 days on a phone, in uk and in long German weeks', () => {
    // 360 px картка ≈ 290 px області; «19 лист.» і «ab 17. Nov.» (12 px).
    for (const label of ['19 лист.', 'з 17 лист.', 'ab 17. Nov.']) {
      const width = textWidth(label, 12);
      for (const count of [7, 30, 52, 90]) {
        const labels = xLabelLayout(count, 290, width, 56);
        expect(labels[0]!.index).toBe(0);
        expectApart(labels, width, 290);
      }
    }
  });

  it('a pinned first label does not swallow the next one: a year on a phone has a label in between', () => {
    const width = textWidth('з 24 лист.', 12);
    const labels = xLabelLayout(52, 270, width, 56);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expectApart(labels, width, 270);
  });

  it('labels a single bar and none for no bars', () => {
    expect(xLabelLayout(1, 300, 40, 56)).toEqual([{ index: 0, x: 150, anchor: 'middle' }]);
    expect(xLabelLayout(0, 300, 40, 56)).toEqual([]);
  });

  it('labels every bar when there is room', () => {
    // 24 години на широкому діалозі: 1400 / 24 ≈ 58 px на стовпчик.
    expect(xLabelLayout(24, 1400, 15, 56).map((label) => label.index)).toEqual(Array.from({ length: 24 }, (_, index) => index));
    // Короткі підписи годин («09») дозволяють менший проміжок.
    expect(xLabelLayout(24, 900, 15, 28)).toHaveLength(24);
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

  it('counts the change of a share in percentage points', () => {
    expect(deltaPoints(60, 50)).toBe(10);
    expect(deltaPoints(40, 50)).toBe(-10);
    expect(deltaPoints(5, 0)).toBe(5);
    expect(deltaPoints(null, 4)).toBeNull();
    expect(pointsText(10)).toBe('10 п.п.');
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
