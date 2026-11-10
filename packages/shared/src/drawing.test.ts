import { describe, expect, it } from 'vitest';
import { LIMITS, applyDrawOp, packStrokes, strokePoints, unpackStrokes, type DrawOp, type Stroke } from './index';

const stroke = (c: number, w: number, p: number[]): Stroke => ({ c, w, p });

describe('drawing strokes (28c)', () => {
  it('applies begin, more, undo and clear', () => {
    const empty: Stroke[] = Object.freeze([]) as unknown as Stroke[];
    const one = applyDrawOp(empty, { op: 'begin', c: 1, w: 0, p: [10, 20] });
    expect(one).toEqual([stroke(1, 0, [10, 20])]);
    const frozen = Object.freeze(one.map((s) => Object.freeze({ ...s, p: Object.freeze([...s.p]) as unknown as number[] }))) as Stroke[];
    const more = applyDrawOp(frozen, { op: 'more', index: 0, p: [30, 40, 50, 60] });
    expect(more).toEqual([stroke(1, 0, [10, 20, 30, 40, 50, 60])]);
    expect(frozen[0]!.p).toEqual([10, 20]);
    const two = applyDrawOp(more, { op: 'begin', c: 8, w: 2, p: [0, 0] });
    expect(two).toHaveLength(2);
    expect(more).toHaveLength(1);
    expect(applyDrawOp(two, { op: 'undo' })).toEqual(more);
    expect(applyDrawOp(two, { op: 'clear' })).toEqual([]);
    expect(two).toHaveLength(2);
  });

  it('counts points', () => {
    expect(strokePoints([stroke(0, 0, [1, 1, 2, 2, 3, 3]), stroke(1, 1, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4])])).toBe(8);
    expect(strokePoints([])).toBe(0);
  });

  it('packs and unpacks strokes losslessly', () => {
    const strokes = [
      stroke(8, 2, [0, 1000, 1000, 0, 500, 500, 499, 3, 0, 0]),
      stroke(0, 0, [7, 7]),
      stroke(3, 1, [1000, 1000, 900, 950, 800, 900, 700, 500]),
    ];
    expect(unpackStrokes(packStrokes(strokes))).toEqual(strokes);
    expect(unpackStrokes(packStrokes([]))).toEqual([]);
    const big: Stroke[] = Array.from({ length: LIMITS.maxStrokes }, (_, i) =>
      stroke(i % 9, i % 3, Array.from({ length: 52 }, (_, k) => (k % 2 === 0 ? (i * 7 + k * 13) % 1001 : (i * 11 + k * 5) % 1001))),
    );
    const packed = packStrokes(big);
    expect(unpackStrokes(packed)).toEqual(big);
    expect(packed.length).toBeLessThan(JSON.stringify(big).length);
  });

  it('a broken packed string gives no strokes', () => {
    for (const bad of ['zz:', '1:1,2,3', '', '99:1,1', '0:', '0:1,1;x']) expect(unpackStrokes(bad)).toEqual([]);
  });

  it('ops are plain data', () => {
    const op: DrawOp = { op: 'undo' };
    expect(applyDrawOp([], op)).toEqual([]);
  });
});
