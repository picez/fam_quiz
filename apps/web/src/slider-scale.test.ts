import { describe, expect, it } from 'vitest';
import { layoutMarks, scalePct } from './slider-scale';

describe('slider scale', () => {
  it('places a value on the axis in percent', () => {
    expect(scalePct(50, 0, 100)).toBe(50);
    expect(scalePct(-5, 0, 100)).toBe(0);
    expect(scalePct(500, 0, 100)).toBe(100);
  });

  it('puts close marks into different rows and far ones into the first', () => {
    const rows = layoutMarks([{ value: 80 }, { value: 50 }, { value: 51 }], 0, 100, 8);
    expect(rows.map((mark) => [mark.value, mark.row])).toEqual([[50, 0], [51, 1], [80, 0]]);
  });

  it('clamps marks outside the range to the edges', () => {
    const rows = layoutMarks([{ value: -10 }, { value: 200 }], 0, 100);
    expect(rows.map((mark) => mark.pct)).toEqual([0, 100]);
  });

  it('caps the rows and leaves the rest without a label', () => {
    const marks = Array.from({ length: 20 }, (_, index) => ({ value: 50 + index * 0.1 }));
    const laid = layoutMarks(marks, 0, 100, 8, 3);
    expect(Math.max(...laid.map((mark) => mark.row ?? -1))).toBe(2);
    expect(laid.filter((mark) => mark.row === null)).toHaveLength(17);
  });
});
