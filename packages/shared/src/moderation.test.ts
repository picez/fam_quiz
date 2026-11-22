import { describe, expect, it } from 'vitest';
import { ADMIN_FEED_KINDS, adminFeedQuerySchema, adminGroupDeleteSchema, adminGroupHideSchema, adminGroupItemSchema, adminGroupMemberAddSchema, adminGroupOwnerSchema, adminHideSchema } from './moderation';

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

describe('moderation: adding to groups (72)', () => {
  it('a member to add is one user id', () => {
    expect(adminGroupMemberAddSchema.parse({ userId: 'u1' })).toEqual({ userId: 'u1' });
    expect(adminGroupMemberAddSchema.safeParse({}).success).toBe(false);
    expect(adminGroupMemberAddSchema.safeParse({ userId: '' }).success).toBe(false);
    expect(adminGroupMemberAddSchema.safeParse({ userId: 'u'.repeat(65) }).success).toBe(false);
    expect(adminGroupMemberAddSchema.safeParse({ userId: 'u1', role: 'owner' }).success).toBe(false);
  });

  it('a bot record is a plain record: no photo, no surprise', () => {
    const plain = { kind: 'fact', text: ' Бабуся свистить ', about: [], answer: null, year: null, photo: null, surprise: false };
    expect(adminGroupItemSchema.parse(plain)).toEqual({ ...plain, text: 'Бабуся свистить' });
    const member = [{ kind: 'member', userId: 'u1' }];
    expect(adminGroupItemSchema.safeParse({ ...plain, about: member, surprise: true }).success).toBe(false);
    expect(adminGroupItemSchema.safeParse({ ...plain, photo: 'https://img.example/p.webp' }).success).toBe(false);
    // справжнє посилання на завантаження теж ні: фото з адмінки немає
    expect(adminGroupItemSchema.safeParse({ ...plain, photo: '/uploads/abcdef0123456789.webp' }).success).toBe(false);
    expect(adminGroupItemSchema.safeParse({ ...plain, kind: 'post' }).success).toBe(false);
    const empty = adminGroupItemSchema.safeParse({ ...plain, text: '   ' });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0]?.message).toBe('item_text');
  });
});
