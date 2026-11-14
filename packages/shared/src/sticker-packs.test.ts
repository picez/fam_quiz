import { describe, expect, it } from 'vitest';
import { isAnti } from './achievements';
import {
  compareByPack,
  legacyStickerOpen,
  PACK_ACHIEVEMENTS,
  packOf,
  packsByAchievements,
  STICKER_PACKS,
  STICKERS_BY_PACK,
} from './sticker-packs';
import { compareStickers, STICKERS } from './stickers';

describe('sticker packs (34)', () => {
  it('has thirteen packs in display order', () => {
    expect(STICKER_PACKS).toEqual(['basic', 'food', 'party', 'cozy', 'animals', 'everyday', 'winter', 'love', 'hugs', 'baking', 'spooky', 'mischief', 'extra']);
  });

  it('puts every sticker into exactly one pack with the agreed counts', () => {
    for (const s of STICKERS) expect(STICKER_PACKS).toContain(packOf(s.id));
    const counts = Object.fromEntries(STICKER_PACKS.map((p) => [p, STICKERS.filter((s) => packOf(s.id) === p).length]));
    expect(counts).toEqual({ basic: 68, food: 65, party: 30, cozy: 47, animals: 18, everyday: 52, winter: 30, love: 18, hugs: 38, baking: 6, spooky: 22, mischief: 38, extra: 5 });
    expect(STICKER_PACKS.reduce((n, p) => n + STICKERS_BY_PACK[p].length, 0)).toBe(437);
  });

  it('classifies the tricky names', () => {
    expect(packOf('nyasKiss3')).toBe('hugs');
    expect(packOf('nyaKiss1')).toBe('love');
    expect(packOf('nyaaBdaycake')).toBe('food');
    // Правила чутливі до регістру: «xmas» малими в Cutexmas зимою не робить (кількості плану рахувалися так само).
    expect(packOf('nyaaCutexmas')).toBe('basic');
    expect(packOf('nyaXmastree')).toBe('winter');
    expect(packOf('nyaCryinpain')).toBe('spooky');
    expect(packOf('nyaBeach')).toBe('cozy');
    expect(packOf('Burn')).toBe('extra');
    expect(packOf('nyaWork')).toBe('everyday');
    expect(packOf('nyaHappy')).toBe('basic');
    expect(packOf('nyaZzz')).toBe('everyday');
    expect(packOf('Qwerty')).toBe('extra');
  });

  it('opens three packs by an achievement that is not an anti one', () => {
    expect(PACK_ACHIEVEMENTS).toEqual({ spooky: 'night_owl', mischief: 'prankster', extra: 'streak_10' });
    for (const id of Object.values(PACK_ACHIEVEMENTS)) expect(isAnti(id)).toBe(false);
    expect(packsByAchievements(['night_owl', 'first_game'])).toEqual(['spooky']);
    expect(packsByAchievements([])).toEqual([]);
  });

  it('keeps the old series rule for inheritance only', () => {
    expect(legacyStickerOpen('nyaBeach', 1)).toBe(true);
    expect(legacyStickerOpen('nyaaBoba', 2)).toBe(false);
    expect(legacyStickerOpen('nyaaBoba', 3)).toBe(true);
    expect(legacyStickerOpen('nyasHug1', 5)).toBe(false);
    expect(legacyStickerOpen('nyasHug1', 6)).toBe(true);
    expect(legacyStickerOpen('Burn', 8)).toBe(false);
    expect(legacyStickerOpen('Burn', 9)).toBe(true);
    expect(legacyStickerOpen('nope', 40)).toBe(false);
  });

  it('sorts by pack, then like compareStickers', () => {
    const sorted = [...STICKERS].sort(compareByPack);
    expect(sorted.map((s) => packOf(s.id))).toEqual(STICKER_PACKS.flatMap((p) => STICKERS_BY_PACK[p].map(() => p)));
    for (const p of STICKER_PACKS) {
      expect(sorted.filter((s) => packOf(s.id) === p)).toEqual([...STICKERS_BY_PACK[p]].sort(compareStickers));
    }
  });
});
