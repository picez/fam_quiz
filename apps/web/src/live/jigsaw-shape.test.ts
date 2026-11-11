import { describe, expect, it } from 'vitest';
import { JIGSAW_TAB, piecePad, piecePath } from './jigsaw-shape';

/** Усі точки шляху (кінці й контрольні) як пари чисел. */
const points = (d: string): { x: number; y: number }[] => {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push({ x: numbers[i]!, y: numbers[i + 1]! });
  return out;
};

describe('piecePath', () => {
  it('a flat piece is a rectangle', () => {
    const d = piecePath([0, 0, 0, 0], 100, 80);
    expect(d.startsWith('M0 0')).toBe(true);
    for (const corner of ['100 0', '100 80', '0 80']) expect(d).toContain(corner);
  });

  it('a tab goes out and a blank goes in', () => {
    const out = points(piecePath([1, 0, 0, 0], 100, 80));
    expect(Math.min(...out.map((p) => p.y))).toBeLessThan(0);
    expect(Math.min(...out.map((p) => p.y))).toBeGreaterThanOrEqual(-piecePad(100, 80));
    const inward = points(piecePath([-1, 0, 0, 0], 100, 80));
    expect(Math.max(...inward.map((p) => p.y))).toBeGreaterThan(0);
    expect(inward.some((p) => p.y < 0)).toBe(false);
  });

  it('tabs on every side stay within the pad and never exceed a fifth of the smaller side', () => {
    const pad = piecePad(100, 80);
    expect(pad).toBe(Math.ceil(JIGSAW_TAB * 80) + 1);
    const all = points(piecePath([1, 1, 1, 1], 100, 80));
    expect(Math.min(...all.map((p) => p.x))).toBeGreaterThanOrEqual(-pad);
    expect(Math.max(...all.map((p) => p.x))).toBeLessThanOrEqual(100 + pad);
    expect(Math.min(...all.map((p) => p.y))).toBeGreaterThanOrEqual(-pad);
    expect(Math.max(...all.map((p) => p.y))).toBeLessThanOrEqual(80 + pad);
  });

  it('a tab and its mirror on the opposite side are the same curve', () => {
    const key = (list: { x: number; y: number }[]) => list.map((p) => `${p.x.toFixed(2)}/${p.y.toFixed(2)}`).sort();
    const right = points(piecePath([0, 1, 0, 0], 100, 80))
      .filter((p) => p.x > 100)
      .map((p) => ({ x: p.x - 100, y: p.y }));
    const left = points(piecePath([0, 0, 0, 1], 100, 80))
      .filter((p) => p.x < 0)
      .map((p) => ({ x: -p.x, y: p.y }));
    expect(right.length).toBeGreaterThan(0);
    expect(key(left)).toEqual(key(right));
  });
  it('an offset moves the whole piece without changing its shape', () => {
    const at = points(piecePath([1, -1, 1, 0], 100, 80, 300, 160));
    const home = points(piecePath([1, -1, 1, 0], 100, 80));
    expect(at).toHaveLength(home.length);
    at.forEach((p, i) => {
      expect(p.x).toBeCloseTo(home[i]!.x + 300, 1);
      expect(p.y).toBeCloseTo(home[i]!.y + 160, 1);
    });
  });
});
