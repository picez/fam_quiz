import { describe, expect, it } from 'vitest';
import { DECOR_LIMITS, DECOR_SUPPORT, EMPTY_DECOR, INSCRIPTION_PLACES, STICKER_PLACES, TROPHY_PHOTO_PLACES, decorLocked, isEmptyDecor, shownDecor, trophyDecorSchema } from './decor';
import type { TrophyDecor } from './decor';
import { TROPHY_KINDS } from './prizes';
import { STICKERS } from './stickers';
import { seriesLevel } from './levels';

const url = (i: number) => `/uploads/${i.toString(16).padStart(32, '0')}.jpg`;
const photo = (i: number) => ({ url: url(i), crop: { x: 0.5, y: 0.5, scale: 1 } });
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i));
const ins = (place: string, text: string, extra: object = {}) => ({ place, text, font: null, look: 'engraved', color: '#3a2a0e', ...extra });
const base = {
  photos: [],
  photoPlace: 'ring',
  frame: 'none',
  photoStyle: 'normal',
  inscriptions: [],
  effect: { kind: 'none' },
  appearance: 'spin',
  stickers: [],
};
const parse = (over: object) => trophyDecorSchema.safeParse({ ...base, ...over });
const messages = (over: object): string[] => {
  const r = parse(over);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('trophyDecorSchema', () => {
  it('accepts the family grail decor', () => {
    const family = {
      ...base,
      photos: photos(13),
      inscriptions: [
        ins('rim', "Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса"),
        ins('plaque', 'Хочеш я тобі Ді…\nҐрааль покажу?'),
      ],
    };
    const r = trophyDecorSchema.safeParse(family);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(family);
  });

  it('photo limits follow the place', () => {
    expect(parse({ photoPlace: 'ring', photos: photos(16) }).success).toBe(true);
    expect(messages({ photoPlace: 'ring', photos: photos(17) })).toContain('decor_too_many_photos');
    expect(parse({ photoPlace: 'gems', photos: photos(8) }).success).toBe(true);
    expect(parse({ photoPlace: 'gems', photos: photos(9) }).success).toBe(false);
    for (const place of ['medallion', 'plaque', 'backdrop']) {
      expect(parse({ photoPlace: place, photos: photos(1) }).success).toBe(true);
      expect(parse({ photoPlace: place, photos: photos(2) }).success).toBe(false);
    }
    for (const place of TROPHY_PHOTO_PLACES) expect(parse({ photoPlace: place, photos: [] }).success).toBe(true);
  });

  it('inscription limits', () => {
    expect(parse({ inscriptions: [ins('rim', 'a'.repeat(80))] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('rim', 'a'.repeat(81))] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('band', 'a'.repeat(40))] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('band', 'a'.repeat(41))] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('plaque', 'a'.repeat(40))] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('plaque', 'a'.repeat(41))] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('back', 'a'.repeat(60))] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('back', 'a'.repeat(61))] }).success).toBe(false);
    const five = INSCRIPTION_PLACES.map((p) => ins(p, 'x')).concat(ins('rim', 'y'));
    expect(parse({ inscriptions: five }).success).toBe(false);
    expect(messages({ inscriptions: [ins('rim', 'a'), ins('rim', 'b')] })).toContain('decor_place_twice');
    expect(parse({ inscriptions: [ins('plaque', 'a\nb')] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('rim', 'a\nb')] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('plaque', 'a\nb\nc')] }).success).toBe(false);
    const r = parse({ inscriptions: [ins('rim', '  Слава   Україні  ')] });
    expect(r.success && r.data.inscriptions[0]!.text).toBe('Слава Україні');
    expect(parse({ inscriptions: [ins('rim', 'a', { font: 'comic' })] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('rim', 'a', { font: null })] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('rim', 'a', { font: 'hand' })] }).success).toBe(true);
    expect(parse({ inscriptions: [ins('rim', 'a', { color: 'red' })] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('rim', 'a', { color: '#3A2A0E' })] }).success).toBe(true);
  });

  it('plaque is either a photo or text', () => {
    expect(messages({ photoPlace: 'plaque', photos: photos(1), inscriptions: [ins('plaque', 'a')] })).toContain(
      'decor_plaque_twice',
    );
    expect(parse({ photoPlace: 'plaque', photos: [], inscriptions: [ins('plaque', 'a')] }).success).toBe(true);
  });

  it('stickers', () => {
    const id = STICKERS[0]!.id;
    expect(parse({ stickers: STICKER_PLACES.map((place) => ({ id, place })) }).success).toBe(true);
    expect(parse({ stickers: [...STICKER_PLACES, 'front'].map((place) => ({ id, place })) }).success).toBe(false);
    expect(messages({ stickers: [{ id, place: 'front' }, { id, place: 'front' }] })).toContain('decor_place_twice');
    expect(messages({ stickers: [{ id: 'nope', place: 'front' }] })).toContain('decor_unknown_sticker');
  });

  it('crop range', () => {
    const crop = (c: object) => parse({ photos: [{ url: url(1), crop: c }] }).success;
    expect(crop({ x: -0.1, y: 0.5, scale: 1 })).toBe(false);
    expect(crop({ x: 0.5, y: 1.1, scale: 1 })).toBe(false);
    expect(crop({ x: 0.5, y: 0.5, scale: 0.9 })).toBe(false);
    expect(crop({ x: 0.5, y: 0.5, scale: 4.1 })).toBe(false);
    expect(crop({ x: 0, y: 1, scale: 4 })).toBe(true);
  });

  it('effect and appearance are stored as given', () => {
    const r = parse({ effect: { kind: 'glow', color: '#ff0000' }, appearance: 'drop' });
    expect(r.success && r.data.effect).toEqual({ kind: 'glow', color: '#ff0000' });
    expect(r.success && r.data.appearance).toBe('drop');
    expect(parse({ effect: { kind: 'lava' } }).success).toBe(false);
    expect(parse({ extra: 1 }).success).toBe(false);
    expect(parse({ effect: { kind: 'none', extra: 1 } }).success).toBe(false);
    expect(parse({ photos: [{ ...photo(1), extra: 1 }] }).success).toBe(false);
    expect(parse({ photos: [{ url: url(1), crop: { x: 0.5, y: 0.5, scale: 1, extra: 1 } }] }).success).toBe(false);
    expect(parse({ inscriptions: [ins('rim', 'a', { extra: 1 })] }).success).toBe(false);
    expect(parse({ stickers: [{ id: STICKERS[0]!.id, place: 'front', extra: 1 }] }).success).toBe(false);
  });
});

describe('shownDecor', () => {
  const full = {
    ...base,
    photos: photos(3),
    photoPlace: 'ring',
    inscriptions: [ins('rim', 'r'), ins('plaque', 'p')],
    stickers: [
      { id: STICKERS[0]!.id, place: 'front' },
      { id: STICKERS[0]!.id, place: 'base-left' },
    ],
  } as unknown as TrophyDecor;

  it('drops places the kind lacks', () => {
    const star = shownDecor('star', full);
    expect(star.photos).toEqual([]);
    expect(star.inscriptions.map((i) => i.place)).toEqual(['plaque']);
    expect(star.stickers).toHaveLength(2);
    const medal = shownDecor('medal', full);
    expect(medal.stickers.map((s) => s.place)).toEqual(['front']);
    expect(shownDecor('cup', full)).toEqual(full);
  });

  it('support table', () => {
    for (const kind of TROPHY_KINDS) {
      const s = DECOR_SUPPORT[kind];
      expect(s).toBeDefined();
      for (const p of s.photo) expect(TROPHY_PHOTO_PLACES).toContain(p);
      for (const p of s.inscription) expect(INSCRIPTION_PLACES).toContain(p);
      for (const p of s.sticker) expect(STICKER_PLACES).toContain(p);
    }
    expect(DECOR_SUPPORT.medal.photo).not.toContain('ring');
    expect(DECOR_SUPPORT.medal.photo).not.toContain('plaque');
    expect(DECOR_LIMITS.ring).toBe(16);
  });
});

describe('25c level locks', () => {
  const withIns = (font: string | null, place = 'rim') => ({ ...base, inscriptions: [ins(place, 'Ася', { font })] }) as unknown as TrophyDecor;
  const stickerOfSeries = (series: string) => STICKERS.find((s) => s.series === series)!.id;
  const withSticker = (id: string, place = 'front') => ({ ...base, stickers: [{ id, place }] }) as unknown as TrophyDecor;

  it('empty decor is valid and empty', () => {
    expect(trophyDecorSchema.parse(EMPTY_DECOR)).toEqual(EMPTY_DECOR);
    expect(isEmptyDecor(EMPTY_DECOR)).toBe(true);
    expect(isEmptyDecor({ ...EMPTY_DECOR, effect: { kind: 'none', color: '#ffffff' } })).toBe(false);
    expect(isEmptyDecor({ ...EMPTY_DECOR, appearance: 'drop' })).toBe(false);
  });
  it('level locks fonts and stickers', () => {
    expect(decorLocked(withIns('mono'), 2, null)).toBe(true);
    expect(decorLocked(withIns('mono'), 3, null)).toBe(false);
    expect(decorLocked(withIns('hand'), 1, null)).toBe(false);
    expect(decorLocked(withIns(null), 1, null)).toBe(false);
    const other = stickerOfSeries('other');
    expect(decorLocked(withSticker(other), seriesLevel('other') - 1, null)).toBe(true);
    expect(decorLocked(withSticker(other), seriesLevel('other'), null)).toBe(false);
    expect(decorLocked(withSticker(stickerOfSeries('nya')), 1, null)).toBe(false);
  });
  it('stored decor stays valid', () => {
    const other = stickerOfSeries('other');
    const d = { ...base, inscriptions: [ins('rim', 'Ася', { font: 'heavy' })], stickers: [{ id: other, place: 'back' }] } as unknown as TrophyDecor;
    const stored = { ...base, inscriptions: [ins('band', 'Ася', { font: 'heavy' })], stickers: [{ id: other, place: 'front' }] } as unknown as TrophyDecor;
    expect(decorLocked(d, 1, stored)).toBe(false);
    expect(decorLocked(d, 1, null)).toBe(true);
  });
});
