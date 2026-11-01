import { describe, expect, it } from 'vitest';
import { STICKERS } from './stickers';
import type { Phase } from './game';
import { FAVORITE_STICKERS_MAX, favoriteStickersSchema, normalizeFavorites, reactSchema, reactionAllowed, toggleFavorite } from './reactions';

const [a, b, c] = STICKERS.map((s) => s.id);

describe('reactSchema', () => {
  it('accepts a quick emoji and a manifest sticker', () => {
    expect(reactSchema.safeParse({ kind: 'emoji', value: '🔥' }).success).toBe(true);
    expect(reactSchema.safeParse({ kind: 'sticker', value: a }).success).toBe(true);
  });
  it('rejects junk', () => {
    for (const bad of [
      { kind: 'emoji', value: '💩' },
      { kind: 'sticker', value: '../x' },
      { kind: 'sticker', value: `${a}.gif` },
      { kind: 'sticker', value: 'x'.repeat(10_000) },
      { value: '🔥' },
      'x'.repeat(10_000),
      null,
    ]) expect(reactSchema.safeParse(bad).success).toBe(false);
  });
});

describe('reactionAllowed', () => {
  it('is true between questions only', () => {
    for (const phase of ['reveal', 'leaderboard', 'round_end', 'finished'] as Phase[]) expect(reactionAllowed(phase)).toBe(true);
    for (const phase of ['lobby', 'question', 'locked', 'intro', 'board', 'wager', 'duel', 'guide'] as Phase[]) expect(reactionAllowed(phase)).toBe(false);
  });
});

describe('favorites', () => {
  it('normalizes: known ids, no repeats, at most 40', () => {
    expect(normalizeFavorites([b, a, 'nope', b])).toEqual([b, a]);
    const all = STICKERS.slice(0, 45).map((s) => s.id);
    expect(normalizeFavorites(all)).toEqual(all.slice(0, FAVORITE_STICKERS_MAX));
  });
  it('toggles: add to the front, remove if present, drop the oldest over 40', () => {
    expect(toggleFavorite([a, b], c)).toEqual([c, a, b]);
    expect(toggleFavorite([a, b, c], b)).toEqual([a, c]);
    const full = STICKERS.slice(1, 41).map((s) => s.id);
    const next = toggleFavorite(full, a);
    expect(next).toHaveLength(40);
    expect(next[0]).toBe(a);
    expect(next).not.toContain(full[39]);
  });
  it('schema caps the list', () => {
    expect(favoriteStickersSchema.safeParse({ favorites: Array(41).fill(a) }).success).toBe(false);
    expect(favoriteStickersSchema.safeParse({ favorites: [a] }).success).toBe(true);
  });
});
