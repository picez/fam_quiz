import { describe, expect, it } from 'vitest';
import {
  STICKERS,
  STICKER_ID,
  STICKER_SERIES,
  compareStickers,
  seriesOf,
  stickerOf,
  stickerPath,
} from './stickers';

describe('sticker manifest', () => {
  it('has 437 stickers split across the series', () => {
    expect(STICKERS.length).toBe(437);
    const count = { nya: 0, nyaa: 0, nyas: 0, other: 0 };
    for (const s of STICKERS) count[s.series]++;
    expect(count).toEqual({ nya: 208, nyaa: 116, nyas: 108, other: 5 });
    expect(STICKER_SERIES).toEqual(['nya', 'nyaa', 'nyas', 'other']);
  });

  it('has unique, valid ids with the right series', () => {
    const seen = new Set(STICKERS.map((s) => s.id.toLowerCase()));
    expect(seen.size).toBe(STICKERS.length);
    for (const s of STICKERS) {
      expect(s.id).toMatch(STICKER_ID);
      expect(s.series).toBe(seriesOf(s.id));
    }
  });

  it('is sorted', () => {
    const sorted = [...STICKERS].sort(compareStickers);
    expect(STICKERS.map((s) => s.id)).toEqual(sorted.map((s) => s.id));
  });

  it('looks stickers up', () => {
    expect(stickerOf('nyaBoba')?.ext).toBe('gif');
    expect(stickerOf('nyaNana')?.ext).toBe('gif');
    expect(stickerOf('nyaChips')?.ext).toBe('png');
    expect(stickerOf('nope')).toBeUndefined();
    expect(stickerPath(stickerOf('yay')!)).toBe('/stickers/yay.gif');
  });

  it('has no forbidden words in ids', () => {
    for (const s of STICKERS) expect(s.id).not.toMatch(/russia|ussr|sovi|mosc|krem|putin/i);
  });
});
