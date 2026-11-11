import { describe, expect, it } from 'vitest';
import {
  JIGSAW_ASPECTS,
  jigsawCrop,
  jigsawEdgeCount,
  jigsawFits,
  jigsawGrid,
  jigsawPieceRatio,
  jigsawSides,
  jigsawTabs,
} from './jigsaw';

describe('jigsaw geometry', () => {
  it('picks the nearest grid with near-square pieces', () => {
    expect(jigsawGrid(12, '4:3')).toEqual({ rows: 3, cols: 4 });
    expect(jigsawGrid(12, '16:9')).toEqual({ rows: 3, cols: 4 });
    expect(jigsawGrid(12, '3:4')).toEqual({ rows: 4, cols: 3 });
    expect(jigsawGrid(12, '1:1')).toEqual({ rows: 3, cols: 4 });
    expect(jigsawGrid(7, '1:1')).toEqual({ rows: 2, cols: 3 });
    expect(jigsawGrid(7, '16:9')).toEqual({ rows: 2, cols: 4 });
    expect(jigsawGrid(24, '3:4')).toEqual({ rows: 6, cols: 4 });
    expect(jigsawGrid(36, '16:9')).toEqual({ rows: 4, cols: 9 });
    expect(jigsawGrid(36, '1:1')).toEqual({ rows: 6, cols: 6 });
    for (let n = 6; n <= 36; n++) {
      for (const a of JIGSAW_ASPECTS) {
        const { rows, cols } = jigsawGrid(n, a);
        expect(rows * cols).toBeGreaterThanOrEqual(6);
        expect(rows * cols).toBeLessThanOrEqual(36);
        const p = jigsawPieceRatio(rows, cols, a);
        expect(p).toBeGreaterThanOrEqual(0.5);
        expect(p).toBeLessThanOrEqual(2);
      }
    }
  });

  it('generates the same tabs for the same seed', () => {
    const t = jigsawTabs(3, 4, 7);
    expect(jigsawTabs(3, 4, 7)).toBe(t);
    expect(t).toHaveLength(jigsawEdgeCount(3, 4));
    expect(jigsawEdgeCount(3, 4)).toBe(17);
    expect(t).toMatch(/^[01]*$/);
    expect(jigsawTabs(3, 4, 8)).not.toBe(t);
  });

  it('neighbours fit together', () => {
    const rows = 3;
    const cols = 4;
    for (const seed of [1, 2, 3, 99]) {
      const tabs = jigsawTabs(rows, cols, seed);
      for (let k = 0; k < rows * cols; k++) {
        const [top, right, bottom, left] = jigsawSides(rows, cols, tabs, k);
        const r = Math.floor(k / cols);
        const c = k % cols;
        if (c === cols - 1) expect(right).toBe(0);
        else expect(right).toBe(-jigsawSides(rows, cols, tabs, k + 1)[3]);
        if (r === rows - 1) expect(bottom).toBe(0);
        else expect(bottom).toBe(-jigsawSides(rows, cols, tabs, k + cols)[0]);
        if (c === 0) expect(left).toBe(0);
        if (r === 0) expect(top).toBe(0);
      }
    }
  });

  it('snaps only upright and closer than a quarter', () => {
    const g = { rows: 3, cols: 4 };
    expect(jigsawFits(g, 5, 1, 1, 0)).toBe(true);
    expect(jigsawFits(g, 5, 1.24, 1, 0)).toBe(true);
    expect(jigsawFits(g, 5, 1.25, 1, 0)).toBe(false);
    expect(jigsawFits(g, 5, 1.18, 1.18, 0)).toBe(false);
    expect(jigsawFits(g, 5, 1, 1, 1)).toBe(false);
    expect(jigsawFits(g, 5, 1, 1, 2)).toBe(false);
    expect(jigsawFits(g, 5, 1, 1, 3)).toBe(false);
    expect(jigsawFits(g, 12, 0, 0, 0)).toBe(false);
    expect(jigsawFits(g, 5, NaN, 1, 0)).toBe(false);
  });

  it('crops at the focus', () => {
    expect(jigsawCrop(1000, 500, '1:1', { x: 0.5, y: 0.5 })).toEqual({ sx: 250, sy: 0, sw: 500, sh: 500 });
    expect(jigsawCrop(1000, 500, '1:1', { x: 0, y: 0.5 }).sx).toBe(0);
    expect(jigsawCrop(1000, 500, '1:1', { x: 1, y: 0.5 }).sx).toBe(500);
    expect(jigsawCrop(600, 900, '16:9', { x: 0.5, y: 0.5 })).toEqual({ sx: 0, sy: 281.25, sw: 600, sh: 337.5 });
  });

  it('reads the sides of a 2x2 grid from a hand-computed tabs string', () => {
    // edges: v(0,0)=1, v(1,0)=0, h(0,0)=0, h(0,1)=1
    const tabs = '1001';
    expect(jigsawSides(2, 2, tabs, 0)).toEqual([0, 1, -1, 0]);
    expect(jigsawSides(2, 2, tabs, 1)).toEqual([0, 0, 1, -1]);
    expect(jigsawSides(2, 2, tabs, 2)).toEqual([1, -1, 0, 0]);
    expect(jigsawSides(2, 2, tabs, 3)).toEqual([-1, 0, 0, 1]);
  });
});
