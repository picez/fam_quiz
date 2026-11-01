import { describe, expect, it } from 'vitest';
import { SHOWCASE_MAX, TITLE_MS, placedPrizeSchema, placesSchema, prizeContentSchema, publicContent } from './prizes';

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
    expect(prizeContentSchema.safeParse({ ...base, trophy: { kind: 'vase', material: 'gold' } }).success).toBe(false);
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
