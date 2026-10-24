import { describe, expect, it } from 'vitest';
import type { Question } from '@quiz/shared';
import { wallPresent } from './wall';

type Wall = Extract<Question, { type: 'wall' }>;

const wall = (n: number): Wall => ({
  id: 'w',
  type: 'wall',
  text: 'Групи',
  imageUrl: null,
  video: null,
  timeLimit: 90,
  points: 1000,
  mistakes: 3,
  groups: Array.from({ length: n }, (_, g) => ({
    id: `g${g}`,
    name: `Група ${g}`,
    tiles: Array.from({ length: n }, (_, t) => ({ id: `t${g}-${t}`, text: `Слово ${g}-${t}` })),
  })),
});

describe('wallPresent fallback layout', () => {
  for (const n of [3, 4]) {
    it(`${n}×${n} with a stuck rng: all tiles once, and no row and no column is a group`, () => {
      const question = wall(n);
      const order = wallPresent(question, () => 0.999);
      expect(new Set(order).size).toBe(n * n);
      const groupOf = new Map(question.groups.flatMap((g) => g.tiles.map((t) => [t.id, g.id] as const)));
      for (let i = 0; i < n; i += 1) {
        const row = new Set(Array.from({ length: n }, (_, j) => groupOf.get(order[i * n + j])));
        const column = new Set(Array.from({ length: n }, (_, j) => groupOf.get(order[j * n + i])));
        expect(row.size, `row ${i}`).toBeGreaterThan(1);
        expect(column.size, `column ${i}`).toBeGreaterThan(1);
      }
    });
  }
});
