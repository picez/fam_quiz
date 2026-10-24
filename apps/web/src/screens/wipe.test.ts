import { describe, expect, it } from 'vitest';
import { FOG_COLS, fullFog, splatsFor, wipeFog, wipeSplats } from './wipe';

describe('wipe', () => {
  it('wiping clears fog cells around the finger and nothing else', () => {
    const full = fullFog();
    const grid = wipeFog(full, 0.5, 0.5);
    expect(grid[8 * FOG_COLS + 6]).toBe(false);
    expect(grid[0]).toBe(true);
    expect(grid[FOG_COLS - 1]).toBe(true);
    expect(grid[grid.length - 1]).toBe(true);
    expect(grid[grid.length - FOG_COLS]).toBe(true);
    const cleared = grid.filter((cell) => !cell).length;
    expect(cleared).toBeGreaterThanOrEqual(4);
    expect(cleared).toBeLessThanOrEqual(12);
    expect(full.every(Boolean)).toBe(true);
    const again = wipeFog(grid, 0.5, 0.5);
    expect(again.filter((cell) => !cell).length).toBe(cleared);
  });

  it('splats are stable per question and vanish after five wipes', () => {
    const splats = splatsFor(3);
    expect(splats).toEqual(splatsFor(3));
    expect(splats).not.toEqual(splatsFor(4));
    expect(splats).toHaveLength(6);
    for (const s of splats) {
      expect(s.x).toBeGreaterThanOrEqual(0.1);
      expect(s.x).toBeLessThanOrEqual(0.9);
      expect(s.y).toBeGreaterThanOrEqual(0.1);
      expect(s.y).toBeLessThanOrEqual(0.9);
      expect(s.left).toBe(1);
    }
    const first = splats[0]!;
    let now = splats;
    for (let i = 0; i < 4; i++) now = wipeSplats(now, first.x, first.y);
    expect(now).toHaveLength(6);
    expect(now[0]!.left).toBeCloseTo(0.2);
    now = wipeSplats(now, first.x, first.y);
    expect(now).toHaveLength(5);
    expect(now.map((s) => s.id)).toEqual(splats.slice(1).map((s) => s.id));
    expect(now.every((s) => s.left === 1)).toBe(true);
  });

  it('mud splats cover about a third of the zone and every one can be wiped away', () => {
    const splats = splatsFor(7);
    const area = splats.reduce((sum, s) => sum + s.size * s.size, 0);
    expect(area).toBeGreaterThan(0.28);
    expect(area).toBeLessThan(0.55);
    for (const seed of [1, 2, 3, 7, 42]) for (const s of splatsFor(seed)) expect(s.size).toBeGreaterThanOrEqual(0.22);
    let now = splats;
    for (const s of splats) for (let i = 0; i < 5; i++) now = wipeSplats(now, s.x, s.y);
    expect(now).toEqual([]);
  });
});
