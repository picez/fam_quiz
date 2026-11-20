import { describe, expect, it } from 'vitest';
import { ADMIN_FEED_KINDS, adminFeedQuerySchema, adminGroupDeleteSchema, adminGroupHideSchema, adminGroupOwnerSchema, adminHideSchema } from './moderation';

describe('moderation (63)', () => {
  it('feed and group moderation inputs', () => {
    expect(adminFeedQuerySchema.parse({ page: '2', kind: 'prize', user: 'u1' })).toEqual({ page: 2, kind: 'prize', user: 'u1' });
    expect(adminFeedQuerySchema.parse({})).toEqual({ page: 1 });
    expect(() => adminFeedQuerySchema.parse({ kind: 'like' })).toThrow();
    expect(() => adminFeedQuerySchema.parse({ extra: '1' })).toThrow();
    expect(adminHideSchema.parse({ hidden: true })).toEqual({ hidden: true });
    expect(() => adminHideSchema.parse({ hidden: 'yes' })).toThrow();
    expect(adminGroupHideSchema.parse({ hidden: true, reason: '  ' })).toEqual({ hidden: true, reason: null });
    expect(adminGroupHideSchema.parse({ hidden: false })).toEqual({ hidden: false, reason: null });
    expect(adminGroupHideSchema.parse({ hidden: true, reason: ' спам ' })).toEqual({ hidden: true, reason: 'спам' });
    expect(() => adminGroupHideSchema.parse({ hidden: true, reason: 'a'.repeat(501) })).toThrow();
    expect(adminGroupOwnerSchema.parse({ userId: 'u2' })).toEqual({ userId: 'u2' });
    expect(() => adminGroupOwnerSchema.parse({ userId: '' })).toThrow();
    expect(adminGroupDeleteSchema.parse({ name: 'Поліські вечори' })).toEqual({ name: 'Поліські вечори' });
    expect(() => adminGroupDeleteSchema.parse({})).toThrow();
    expect(ADMIN_FEED_KINDS).not.toContain('like');
    expect(ADMIN_FEED_KINDS).toContain('game');
  });
});
