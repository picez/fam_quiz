import { describe, expect, it } from 'vitest';
import { seededRng, shuffle } from './random';

// Еталонні копії старого коду (до 30d), побуквено.

/** sudoku.ts: seededRng */
function refShared(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** bluff.ts: seededRng */
function refEngine(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** wipe.ts: seeded */
function refWipe(seed: number): () => number {
  let a = (seed * 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** sudoku.ts: shuffle (на місці) */
function refShuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** game.ts: shuffle (копія) */
function refShuffleCopy<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const SEEDS = [
  ...Array.from({ length: 2000 }, (_, i) => i),
  -1,
  -(2 ** 31),
  2 ** 31,
  2 ** 32 - 1,
  2 ** 32,
  2 ** 40 + 7,
  Number.MAX_SAFE_INTEGER,
  1.5,
  -0.5,
  NaN,
];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('random (30d)', () => {
  it('seededRng matches both old variants', () => {
    for (const s of SEEDS) {
      const rng = seededRng(s);
      const a = refShared(s);
      const b = refEngine(s);
      for (let k = 0; k < 64; k++) {
        const v = rng();
        expect(v).toBe(a());
        expect(v).toBe(b());
      }
    }
  });

  it('wipe seed scramble is seededRng of the scrambled seed', () => {
    for (const s of SEEDS) {
      const rng = seededRng((s * 0x9e3779b1) >>> 0);
      const ref = refWipe(s);
      for (let k = 0; k < 64; k++) expect(rng()).toBe(ref());
    }
  });

  it('shuffle matches the in-place and copy variants', () => {
    for (let n = 0; n <= 20; n++) {
      for (let s = 0; s < 500; s++) {
        const got = shuffle(range(n), seededRng(s));
        expect(got).toEqual(refShuffleCopy(range(n), refEngine(s)));
        expect(got).toEqual(refShuffleInPlace(range(n), refShared(s)));
      }
    }
  });

  it('shuffle does not mutate its input', () => {
    const input = range(10);
    const result = shuffle(input, seededRng(7));
    expect(input).toEqual(range(10));
    expect(result).not.toBe(input);
  });

  it('values are in [0, 1)', () => {
    const rng = seededRng(42);
    for (let k = 0; k < 10_000; k++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
