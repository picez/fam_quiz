import { describe, expect, it } from 'vitest';
import { ADMIN_ACTION_KINDS, adminListQuerySchema, adminPages, banSchema } from './admin';

describe('adminListQuerySchema', () => {
  it('defaults and coerces', () => {
    expect(adminListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(adminListQuerySchema.parse({ q: '  Оля ', page: '3' })).toEqual({ q: 'Оля', page: 3 });
  });
  it('rejects bad input', () => {
    expect(() => adminListQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => adminListQuerySchema.parse({ page: 'x' })).toThrow();
    expect(() => adminListQuerySchema.parse({ q: 'a'.repeat(101) })).toThrow();
    expect(() => adminListQuerySchema.parse({ sort: 'x' })).toThrow();
  });
});

describe('banSchema', () => {
  it('normalises reason', () => {
    expect(banSchema.parse({})).toEqual({ reason: null });
    expect(banSchema.parse({ reason: '   ' })).toEqual({ reason: null });
    expect(banSchema.parse({ reason: ' спам ' })).toEqual({ reason: 'спам' });
  });
  it('rejects bad input', () => {
    expect(() => banSchema.parse({ reason: 'a'.repeat(501) })).toThrow();
    expect(() => banSchema.parse({ extra: 1 })).toThrow();
  });
});

describe('adminPages', () => {
  it('counts pages', () => {
    expect(adminPages(0)).toBe(1);
    expect(adminPages(50)).toBe(1);
    expect(adminPages(51)).toBe(2);
  });
});

it('ADMIN_ACTION_KINDS', () => {
  expect([...ADMIN_ACTION_KINDS]).toEqual(['ban', 'unban', 'quiz_delete', 'question_delete', 'prize_delete', 'award_delete']);
});
