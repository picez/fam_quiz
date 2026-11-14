import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ANTI_ACHIEVEMENTS } from './achievements';
import {
  COMMON_ACHIEVEMENTS, EPIC_ACHIEVEMENTS, FREE_LOOKS, LEVEL_REWARDS, LEVEL_REWARDS_TOP, LOOK_IDS, NICK_COLORS, NICK_EFFECTS, NICK_FONTS, NICK_FRAMES,
  PHOTO_FRAMES, PROFILE_BADGES, achievementRarity, levelOf, levelProgress, lookLevel, looksAllowed, looksSchema, looksShown, nextRewards,
  packLevel, perkSchema, perksFor, stickerOpen, stickerPacksOpen, trophyUnlockLevel, xpForLevel,
} from './levels';
import { STICKER_PACKS, STICKERS_BY_PACK } from './sticker-packs';
import { TROPHY_KINDS, TROPHY_MATERIALS } from './prizes';

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
  it('keeps the old rewards on their levels, sticker rows now open packs', () => {
    const OLD: [number, object][] = [
      [1, { kind: 'stickers', pack: 'basic' }], [2, { kind: 'color', id: 'sky' }], [3, { kind: 'stickers', pack: 'food' }],
      [4, { kind: 'badge', id: '⭐' }], [5, { kind: 'perk', perk: 'time' }], [6, { kind: 'stickers', pack: 'party' }],
      [7, { kind: 'color', id: 'mint' }], [8, { kind: 'frame', id: 'bronze' }], [9, { kind: 'stickers', pack: 'cozy' }],
      [10, { kind: 'perk', perk: 'hint' }], [11, { kind: 'color', id: 'sun' }], [12, { kind: 'frame', id: 'silver' }],
      [13, { kind: 'badge', id: '🎯' }], [14, { kind: 'color', id: 'coral' }], [15, { kind: 'perk', perk: 'ward' }],
      [16, { kind: 'frame', id: 'gold' }], [17, { kind: 'badge', id: '🧠' }], [18, { kind: 'color', id: 'violet' }],
      [19, { kind: 'badge', id: '⚡' }], [20, { kind: 'perk_boost', perk: 'time' }], [21, { kind: 'frame', id: 'neon' }],
      [22, { kind: 'color', id: 'gold' }], [23, { kind: 'badge', id: '🦉' }], [24, { kind: 'badge', id: '🚀' }],
      [25, { kind: 'frame', id: 'fire' }], [26, { kind: 'color', id: 'rainbow' }], [27, { kind: 'badge', id: '🏅' }],
      [28, { kind: 'badge', id: '💎' }], [29, { kind: 'badge', id: '🔱' }], [30, { kind: 'frame', id: 'rainbow' }],
    ];
    const got = LEVEL_REWARDS.filter((r) => OLD.some(([l, o]) => l === r.level && JSON.stringify(o) === JSON.stringify(r.reward))).map((r) => [r.level, r.reward]);
    expect(got).toEqual(OLD);
  });
  it('every new shape and material has one level', () => {
    const SHAPES: Record<string, number> = { goblet: 2, vase: 4, laurel: 5, starmedal: 6, figure: 8, octagon: 10, lovingcup: 12, ribbon: 14, flame: 16, olive: 18, cross: 20, diadem: 22, plate: 24, wings: 26, fist: 28 };
    const MATERIALS: Record<string, number> = { copper: 3, rosegold: 7, wood: 9, marble: 11, jade: 13, platinum: 15, obsidian: 17, pearl: 19, sapphire: 21, ruby: 23, neon: 25 };
    for (const [id, level] of Object.entries(SHAPES)) {
      expect(LEVEL_REWARDS.filter((r) => r.reward.kind === 'shape' && r.reward.id === id).map((r) => r.level), id).toEqual([level]);
      expect(trophyUnlockLevel('shape', id)).toBe(level);
    }
    for (const [id, level] of Object.entries(MATERIALS)) {
      expect(LEVEL_REWARDS.filter((r) => r.reward.kind === 'material' && r.reward.id === id).map((r) => r.level), id).toEqual([level]);
      expect(trophyUnlockLevel('material', id)).toBe(level);
    }
    expect(trophyUnlockLevel('shape', 'cup')).toBe(1);
    expect(trophyUnlockLevel('material', 'gold')).toBe(1);
    for (const kind of TROPHY_KINDS.slice(6)) expect(SHAPES[kind], kind).toBeDefined();
    for (const material of TROPHY_MATERIALS.slice(4)) expect(MATERIALS[material], material).toBeDefined();
  });
  it('every look id is free or rewarded exactly once', () => {
    for (const slot of Object.keys(LOOK_IDS) as (keyof typeof LOOK_IDS)[]) {
      for (const id of LOOK_IDS[slot]) {
        const free = FREE_LOOKS[slot].includes(id) ? 1 : 0;
        const rewarded = LEVEL_REWARDS.filter((r) => r.reward.kind === slot && (r.reward as { id?: string }).id === id).length;
        expect(free + rewarded, `${slot} ${id}`).toBe(1);
      }
    }
  });
  it('levels are sorted, within 1..40 and each has a reward', () => {
    const levels = LEVEL_REWARDS.map((r) => r.level);
    expect(levels).toEqual([...levels].sort((x, y) => x - y));
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(1);
    expect(LEVEL_REWARDS_TOP).toBe(40);
    expect(Math.max(...levels)).toBe(LEVEL_REWARDS_TOP);
    for (let n = 1; n <= 40; n++) expect(levels).toContain(n);
  });
  it('34: levels 31–40 exactly, effects 18 and 27, packs once each', () => {
    const TOP: [number, object][] = [
      [31, { kind: 'effect', id: 'flame' }], [31, { kind: 'badge', id: '🦋' }],
      [32, { kind: 'photo', id: 'sunflowers' }], [32, { kind: 'stickers', pack: 'baking' }],
      [33, { kind: 'effect', id: 'frost' }], [33, { kind: 'frame', id: 'glacier' }],
      [34, { kind: 'photo', id: 'waves' }], [34, { kind: 'badge', id: '🪐' }],
      [35, { kind: 'effect', id: 'stardust' }],
      [36, { kind: 'stickers', pack: 'spooky' }], [36, { kind: 'photo', id: 'constellation' }],
      [37, { kind: 'effect', id: 'bolt' }],
      [38, { kind: 'stickers', pack: 'mischief' }],
      [39, { kind: 'stickers', pack: 'extra' }],
      [40, { kind: 'effect', id: 'shimmer' }], [40, { kind: 'frame', id: 'aurora' }], [40, { kind: 'badge', id: '🌠' }],
    ];
    expect(LEVEL_REWARDS.filter((r) => r.level > 30).map((r) => [r.level, r.reward])).toEqual(TOP);
    expect(lookLevel('effect', 'light')).toBe(18);
    expect(lookLevel('effect', 'sparks')).toBe(27);
    const PACKS = { basic: 1, food: 3, party: 6, cozy: 9, animals: 12, everyday: 15, winter: 19, love: 23, hugs: 28, baking: 32, spooky: 36, mischief: 38, extra: 39 };
    for (const pack of STICKER_PACKS) {
      expect(LEVEL_REWARDS.filter((r) => r.reward.kind === 'stickers' && r.reward.pack === pack).map((r) => r.level), pack).toEqual([PACKS[pack]]);
      expect(packLevel(pack)).toBe(PACKS[pack]);
    }
  });
  it('counts', () => {
    expect(PHOTO_FRAMES).toHaveLength(15);
    expect(NICK_FONTS).toHaveLength(8);
    expect(NICK_COLORS).toHaveLength(13);
    expect(NICK_FRAMES).toHaveLength(8);
    expect(NICK_EFFECTS).toHaveLength(7);
    expect(PROFILE_BADGES).toHaveLength(39);
    for (const list of [PHOTO_FRAMES, NICK_FONTS, NICK_COLORS, NICK_FRAMES, NICK_EFFECTS, PROFILE_BADGES]) expect(new Set(list).size).toBe(list.length);
    expect(PROFILE_BADGES.some((b) => /\p{Regional_Indicator}|🏳|🏴/u.test(b))).toBe(false);
  });
  it('lookLevel', () => {
    expect(lookLevel('photo', 'aura')).toBe(30);
    expect(lookLevel('font', 'pixel')).toBe(16);
    expect(lookLevel('color', 'venom')).toBe(14);
    expect(lookLevel('badge', '👑')).toBe(25);
    expect(lookLevel('photo', 'crimson')).toBe(1);
    expect(lookLevel('badge', '🌻')).toBe(1);
    expect(lookLevel('color', 'sky')).toBe(2);
    expect(lookLevel('font', 'comic')).toBe(Infinity);
    expect(lookLevel('effect', 'flame')).toBe(31);
    expect(lookLevel('frame', 'aurora')).toBe(40);
    expect(lookLevel('photo', 'sunflowers')).toBe(32);
    expect(lookLevel('badge', '🦋')).toBe(31);
  });
  it('nextRewards', () => {
    expect(nextRewards(15).map((r) => r.level)).toEqual([16, 16, 16, 17, 17, 17, 18, 18, 18, 18]);
    expect(nextRewards(30).map((r) => r.level)).toEqual([31, 31, 32, 32, 33, 33]);
    expect(nextRewards(40)).toEqual([]);
  });
  it('perksFor', () => {
    expect(perksFor(4)).toEqual({ kinds: [], timeMs: 5000 });
    expect(perksFor(10)).toEqual({ kinds: ['time', 'hint'], timeMs: 5000 });
    expect(perksFor(20)).toEqual({ kinds: ['time', 'hint', 'ward'], timeMs: 10000 });
    expect(perksFor(20).timeMs).toBe(10_000);
    expect(perksFor(5).kinds).toEqual(['time']);
  });
});

describe('stickers', () => {
  const notNya = (pack: keyof typeof STICKERS_BY_PACK) => STICKERS_BY_PACK[pack].find((s) => s.series !== 'nya')!.id;
  it('opens packs by level and by achievement', () => {
    expect(stickerPacksOpen(null)).toEqual(['basic']);
    expect(stickerPacksOpen(9)).toEqual(['basic', 'food', 'party', 'cozy']);
    expect(stickerPacksOpen(9, { packs: ['spooky'] })).toEqual(['basic', 'food', 'party', 'cozy', 'spooky']);
    expect(stickerPacksOpen(40)).toEqual([...STICKER_PACKS]);
  });
  it('opens a sticker by its pack, an achievement pack or the inherited level', () => {
    const spooky = notNya('spooky');
    expect(stickerOpen(spooky, 10)).toBe(false);
    expect(stickerOpen(spooky, 10, { packs: ['spooky'] })).toBe(true);
    expect(stickerOpen(spooky, 36)).toBe(true);
    const cozyNyas = STICKERS_BY_PACK.cozy.find((s) => s.series === 'nyas')!.id;
    expect(stickerOpen(cozyNyas, 5)).toBe(false);
    expect(stickerOpen(cozyNyas, 5, { legacyLevel: 6 })).toBe(true);
    expect(stickerOpen(cozyNyas, 5, { legacyLevel: 5 })).toBe(false);
    expect(stickerOpen('nope', 40, { legacyLevel: 40, packs: [...STICKER_PACKS] })).toBe(false);
  });
  it('keeps the old guest set (series nya) for everyone, guests too', () => {
    expect(stickerOpen('nyaBeach', null)).toBe(true);
    expect(stickerOpen('nyaBeach', 1)).toBe(true);
    const basicNyaa = STICKERS_BY_PACK.basic.find((s) => s.series === 'nyaa')!.id;
    expect(stickerOpen(basicNyaa, null)).toBe(true);
    expect(stickerOpen(notNya('food'), null)).toBe(false);
    expect(stickerOpen(notNya('food'), 3)).toBe(true);
  });
});

describe('looks', () => {
  const none = { color: null, frame: null, badge: null, photo: null, font: null, effect: null };
  it('schema', () => {
    expect(looksSchema.safeParse({ color: 'sky', frame: null, badge: '⭐' }).success).toBe(true);
    expect(looksSchema.safeParse({ color: 'sky', frame: null, badge: '⭐', photo: 'fire', font: null }).success).toBe(true);
    expect(looksSchema.safeParse({ ...none, photo: 'tomoe' }).success).toBe(false);
    expect(looksSchema.safeParse({ color: 'pink', frame: null, badge: null }).success).toBe(false);
    expect(looksSchema.safeParse({ color: null, frame: null, badge: null, extra: 1 }).success).toBe(false);
    expect(looksSchema.safeParse({ ...none, effect: 'flame' }).success).toBe(true);
    expect(looksSchema.safeParse({ ...none, effect: 'smoke' }).success).toBe(false);
  });
  it('allowed and shown', () => {
    expect(looksAllowed({ ...none, color: 'sky' }, 1)).toBe(false);
    expect(looksAllowed({ ...none, color: 'sky' }, 2)).toBe(true);
    expect(looksAllowed({ ...none, photo: 'fire' }, 16)).toBe(false);
    expect(looksAllowed({ ...none, photo: 'fire' }, 17)).toBe(true);
    expect(looksAllowed({ ...none, font: 'hand' }, 1)).toBe(true);
    expect(looksShown({ color: 'rainbow', frame: 'bronze', badge: '⭐', photo: 'aura', font: 'hand', effect: null }, 10))
      .toEqual({ color: null, frame: 'bronze', badge: '⭐', photo: null, font: 'hand', effect: null });
    expect(looksAllowed({ ...none, effect: 'flame' }, 30)).toBe(false);
    expect(looksAllowed({ ...none, effect: 'flame' }, 31)).toBe(true);
    expect(looksShown({ ...none, effect: 'flame' }, 30).effect).toBeNull();
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

  it('gives every anti-achievement common XP and the mechanics ones rare (12j)', () => {
    for (const id of ANTI_ACHIEVEMENTS) expect(achievementRarity(id)).toBe('common');
    expect(achievementRarity('lawyer')).toBe('rare');
  });

  it('33: four new common ones, two new epic ones, the rest rare', () => {
    for (const id of ['single_ten', 'sold', 'crossword_full', 'holiday', 'modern_art'] as const) expect(achievementRarity(id)).toBe('common');
    for (const id of ['buffet', 'elephant_memory'] as const) expect(achievementRarity(id)).toBe('epic');
    for (const id of ['classic_clean', 'host_marathon', 'first_note'] as const) expect(achievementRarity(id)).toBe('rare');
  });
});

describe('perkSchema', () => {
  it('accepts active perks only', () => {
    expect(perkSchema.safeParse({ kind: 'time' }).success).toBe(true);
    expect(perkSchema.safeParse({ kind: 'ward' }).success).toBe(false);
  });
});
