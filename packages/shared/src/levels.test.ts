import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from './achievements';
import {
  COMMON_ACHIEVEMENTS, EPIC_ACHIEVEMENTS, LEVEL_REWARDS, NICK_COLORS, NICK_FRAMES, PROFILE_BADGES,
  achievementRarity, levelOf, levelProgress, looksAllowed, looksSchema, looksShown, perkSchema, perksFor,
  stickerOpen, stickerSeriesOpen, xpForLevel,
} from './levels';
import { STICKERS, STICKER_SERIES } from './stickers';

describe('level curve', () => {
  it('has the anchor values and grows', () => {
    const anchors: [number, number][] = [[1, 0], [2, 280], [3, 520], [5, 1120], [10, 3160], [15, 5810], [20, 8940], [30, 16430]];
    for (const [level, xp] of anchors) expect(xpForLevel(level)).toBe(xp);
    for (let n = 1; n <= 60; n++) expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
  });
  it('levelOf', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(279)).toBe(1);
    expect(levelOf(280)).toBe(2);
    expect(levelOf(3159)).toBe(9);
    expect(levelOf(3160)).toBe(10);
    expect(levelOf(100000)).toBeGreaterThan(30);
  });
  it('levelProgress', () => {
    expect(levelProgress(600)).toEqual({ level: 3, xp: 600, levelAt: 520, nextAt: 800 });
  });
});

describe('rewards', () => {
  it('has one reward per level 1..30', () => {
    expect(LEVEL_REWARDS.map((r) => r.level)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const at = (n: number) => LEVEL_REWARDS[n - 1].reward;
    expect(at(5)).toEqual({ kind: 'perk', perk: 'time' });
    expect(at(10)).toEqual({ kind: 'perk', perk: 'hint' });
    expect(at(15)).toEqual({ kind: 'perk', perk: 'ward' });
    expect(at(20).kind).toBe('perk_boost');
  });
  it('gives every colour, frame and badge exactly once', () => {
    const count = (kind: string, id: string) => LEVEL_REWARDS.filter((r) => r.reward.kind === kind && (r.reward as { id?: string }).id === id).length;
    for (const c of NICK_COLORS) expect(count('color', c)).toBe(1);
    for (const f of NICK_FRAMES) expect(count('frame', f)).toBe(1);
    for (const b of PROFILE_BADGES) expect(count('badge', b)).toBe(1);
  });
  it('perksFor', () => {
    expect(perksFor(4)).toEqual({ kinds: [], timeMs: 5000 });
    expect(perksFor(10)).toEqual({ kinds: ['time', 'hint'], timeMs: 5000 });
    expect(perksFor(20)).toEqual({ kinds: ['time', 'hint', 'ward'], timeMs: 10000 });
  });
});

describe('stickers', () => {
  it('opens series by level', () => {
    expect(stickerSeriesOpen(null)).toEqual(['nya']);
    expect(stickerSeriesOpen(1)).toEqual(['nya']);
    expect(stickerSeriesOpen(3)).toEqual(['nya', 'nyaa']);
    expect(stickerSeriesOpen(9)).toEqual([...STICKER_SERIES]);
    const nyas = STICKERS.find((s) => s.series === 'nyas')!.id;
    expect(stickerOpen(nyas, 5)).toBe(false);
    expect(stickerOpen(nyas, 6)).toBe(true);
    expect(stickerOpen('nope', 30)).toBe(false);
  });
});

describe('looks', () => {
  it('schema', () => {
    expect(looksSchema.safeParse({ color: 'sky', frame: null, badge: '⭐' }).success).toBe(true);
    expect(looksSchema.safeParse({ color: 'pink', frame: null, badge: null }).success).toBe(false);
    expect(looksSchema.safeParse({ color: null, frame: null, badge: null, extra: 1 }).success).toBe(false);
  });
  it('allowed and shown', () => {
    expect(looksAllowed({ color: 'sky', frame: null, badge: null }, 1)).toBe(false);
    expect(looksAllowed({ color: 'sky', frame: null, badge: null }, 2)).toBe(true);
    expect(looksShown({ color: 'rainbow', frame: 'bronze', badge: '⭐' }, 10)).toEqual({ color: null, frame: 'bronze', badge: '⭐' });
  });
});

describe('achievement rarity', () => {
  it('classifies', () => {
    expect(achievementRarity('first_game')).toBe('common');
    expect(achievementRarity('veteran')).toBe('epic');
    expect(achievementRarity('sniper')).toBe('rare');
    for (const id of [...COMMON_ACHIEVEMENTS, ...EPIC_ACHIEVEMENTS]) expect(ACHIEVEMENTS).toContain(id);
    expect(COMMON_ACHIEVEMENTS.filter((id) => EPIC_ACHIEVEMENTS.includes(id))).toEqual([]);
  });
});

describe('perkSchema', () => {
  it('accepts active perks only', () => {
    expect(perkSchema.safeParse({ kind: 'time' }).success).toBe(true);
    expect(perkSchema.safeParse({ kind: 'ward' }).success).toBe(false);
  });
});
