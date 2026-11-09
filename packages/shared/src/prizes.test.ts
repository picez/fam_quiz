import { describe, expect, it } from 'vitest';
import * as shared from './index';
import { EMPTY_DECOR } from './decor';
import { PREMIUM_KINDS, PREMIUM_MATERIALS, SHOWCASE_MAX, TITLE_MS, TROPHY_KINDS, TROPHY_MATERIALS, placedPrizeSchema, placesSchema, prizeContentSchema, publicContent, trophyLocked } from './prizes';

const base = { name: 'Головний приз', trophy: null, engraving: null, real: null, title: null, diploma: false };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('prizeContentSchema', () => {
  it('trims and squeezes the name', () => {
    const r = prizeContentSchema.safeParse({ ...base, name: '  Головний  приз ', trophy: { kind: 'cup', material: 'gold' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Головний приз');
  });
  it('needs at least one option', () => {
    const r = prizeContentSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toBe('prize_empty');
  });
  it('accepts a diploma alone', () => {
    expect(prizeContentSchema.safeParse({ ...base, diploma: true }).success).toBe(true);
  });
  it('limits the engraving to 80', () => {
    expect(prizeContentSchema.safeParse({ ...base, engraving: 'a'.repeat(81) }).success).toBe(false);
    expect(prizeContentSchema.safeParse({ ...base, engraving: 'a'.repeat(80) }).success).toBe(true);
  });
  it('checks the real prize photo url', () => {
    const ok = { text: 'Піца 🍕', photoUrl: '/uploads/' + 'a'.repeat(32) + '.jpg' };
    expect(prizeContentSchema.safeParse({ ...base, real: ok }).success).toBe(true);
    expect(prizeContentSchema.safeParse({ ...base, real: { ...ok, photoUrl: 'https://x/y.jpg' } }).success).toBe(false);
  });
  it('rejects a bad kind and an empty name', () => {
    expect(prizeContentSchema.safeParse({ ...base, trophy: { kind: 'urn', material: 'gold' } }).success).toBe(false);
    expect(prizeContentSchema.safeParse({ ...base, name: '', diploma: true }).success).toBe(false);
  });
  it('rejects unstorable text', () => {
    expect(prizeContentSchema.safeParse({ ...base, title: 'a\u0000b' }).success).toBe(false);
  });
});

describe('placesSchema', () => {
  it('accepts distinct ids and nulls', () => {
    expect(placesSchema.safeParse({ places: [A, null, B] }).success).toBe(true);
    expect(placesSchema.safeParse({ places: [null, null, null] }).success).toBe(true);
  });
  it('rejects the same id twice', () => {
    const r = placesSchema.safeParse({ places: [A, A, null] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toBe('prize_twice');
  });
  it('rejects a wrong length, a non-uuid and an extra key', () => {
    expect(placesSchema.safeParse({ places: [A, null] }).success).toBe(false);
    expect(placesSchema.safeParse({ places: ['x', null, null] }).success).toBe(false);
    expect(placesSchema.safeParse({ places: [A, null, null], extra: 1 }).success).toBe(false);
  });
});

describe('placedPrizeSchema', () => {
  const content = { ...base, diploma: true };
  it('accepts places 1-3 only', () => {
    expect(placedPrizeSchema.safeParse({ place: 1, id: A, content }).success).toBe(true);
    expect(placedPrizeSchema.safeParse({ place: 4, id: A, content }).success).toBe(false);
  });
});

describe('publicContent', () => {
  it('drops the name only', () => {
    const c = { ...base, trophy: { kind: 'star' as const, material: 'silver' as const }, diploma: true };
    const p = publicContent(c);
    expect('name' in p).toBe(false);
    expect(p).toEqual({ trophy: c.trophy, engraving: null, real: null, title: null, diploma: true });
  });
});

describe('constants', () => {
  it('has the agreed values', () => {
    expect(TITLE_MS).toBe(604_800_000);
    expect(SHOWCASE_MAX).toBe(60);
  });
});

describe('trophy decor in prize content', () => {
  const decor = {
    photos: [],
    photoPlace: 'ring',
    frame: 'none',
    photoStyle: 'normal',
    inscriptions: [],
    effect: { kind: 'none' },
    appearance: 'spin',
    stickers: [],
  };
  const trophy = { kind: 'cup', material: 'gold' };
  it('old content stays valid', () => {
    for (const c of [
      { ...base, trophy },
      { ...base, trophy: { kind: 'medal', material: 'silver' } },
      { ...base, trophy: { kind: 'grail', material: 'gold' }, engraving: 'Ясі' },
    ]) {
      const r = prizeContentSchema.safeParse(c);
      expect(r.success).toBe(true);
      if (r.success && r.data.trophy) expect('decor' in r.data.trophy).toBe(false);
    }
  });
  it('trophy decor is optional, nullable and strict', () => {
    expect(prizeContentSchema.safeParse({ ...base, trophy: { ...trophy, decor } }).success).toBe(true);
    expect(prizeContentSchema.safeParse({ ...base, trophy: { ...trophy, decor: null } }).success).toBe(true);
    expect(prizeContentSchema.safeParse({ ...base, trophy: { ...trophy, decor: {} } }).success).toBe(false);
    expect(prizeContentSchema.safeParse({ ...base, trophy: { ...trophy, extra: 1 } }).success).toBe(false);
  });
  it('grail is a regular kind', () => {
    const r = prizeContentSchema.safeParse({ ...base, trophy: { kind: 'grail', material: 'gold', decor: EMPTY_DECOR } });
    expect(r.success).toBe(true);
    expect('PICKABLE_TROPHY_KINDS' in shared).toBe(false);
    expect('isPickableTrophy' in shared).toBe(false);
  });
  it('placedPrizeSchema accepts decorated content', () => {
    const content = { ...base, trophy: { ...trophy, decor } };
    expect(placedPrizeSchema.safeParse({ place: 1, id: A, content }).success).toBe(true);
  });
});

describe('new kinds and materials (25e)', () => {
  it('new kinds and materials parse', () => {
    expect(prizeContentSchema.safeParse({ ...base, trophy: { kind: 'plate', material: 'neon' } }).success).toBe(true);
    expect(prizeContentSchema.safeParse({ ...base, trophy: { kind: 'vase', material: 'wood' } }).success).toBe(true);
  });
  it('an old placed prize parses to the same value', () => {
    const decor = { ...EMPTY_DECOR, frame: 'gold' as const, photoStyle: 'sepia' as const, appearance: 'rise' as const };
    const content = { ...base, trophy: { kind: 'cup', material: 'gold', decor }, diploma: true };
    const placed = { place: 1, id: A, content };
    const r = placedPrizeSchema.safeParse(placed);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(placed);
  });
  it('keeps the old values first and unique', () => {
    expect(TROPHY_KINDS.slice(0, 6)).toEqual(['cup', 'medal', 'crown', 'star', 'statuette', 'grail']);
    expect(TROPHY_MATERIALS.slice(0, 4)).toEqual(['bronze', 'silver', 'gold', 'diamond']);
    expect(TROPHY_KINDS).toHaveLength(21);
    expect(TROPHY_MATERIALS).toHaveLength(15);
    expect(new Set(TROPHY_KINDS).size).toBe(21);
    expect(new Set(TROPHY_MATERIALS).size).toBe(15);
  });
  it('premium marks are inside the lists', () => {
    for (const k of PREMIUM_KINDS) expect(TROPHY_KINDS).toContain(k);
    for (const m of PREMIUM_MATERIALS) expect(TROPHY_MATERIALS).toContain(m);
    expect(PREMIUM_KINDS).toEqual(['diadem', 'wings']);
    expect(PREMIUM_MATERIALS).toEqual(['sapphire', 'ruby', 'neon']);
  });
});

describe('trophyLocked', () => {
  it('locks a closed shape or material, like fonts', () => {
    expect(trophyLocked({ kind: 'plate', material: 'gold' }, 1, null)).toBe(true);
    expect(trophyLocked({ kind: 'plate', material: 'gold' }, 24, null)).toBe(false);
    expect(trophyLocked({ kind: 'cup', material: 'neon' }, 1, undefined)).toBe(true);
    expect(trophyLocked({ kind: 'cup', material: 'neon' }, 25, null)).toBe(false);
    expect(trophyLocked({ kind: 'cup', material: 'gold' }, 1, null)).toBe(false);
  });
  it('keeps what this prize already stores', () => {
    expect(trophyLocked({ kind: 'plate', material: 'gold' }, 1, { kind: 'plate', material: 'gold' })).toBe(false);
    expect(trophyLocked({ kind: 'plate', material: 'neon' }, 1, { kind: 'plate', material: 'gold' })).toBe(true);
    expect(trophyLocked({ kind: 'fist', material: 'gold' }, 1, { kind: 'plate', material: 'gold' })).toBe(true);
  });
});
