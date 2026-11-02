import { describe, expect, it } from 'vitest';
import { FEED_KINDS, feedBadgeLabel, feedBadgeTotal, feedCursor, feedCursorSchema, feedLikeSchema, feedSeenSchema } from './feed';

describe('feed', () => {
  it('sums the badge parts', () => {
    expect(feedBadgeTotal({ events: 2, requests: 1, decisions: 3 })).toBe(6);
  });
  it('labels the badge', () => {
    expect(feedBadgeLabel(0)).toBeNull();
    expect(feedBadgeLabel(7)).toBe('7');
    expect(feedBadgeLabel(99)).toBe('99');
    expect(feedBadgeLabel(100)).toBe('99+');
  });
  it('round-trips the cursor', () => {
    const s = feedCursor({ at: '2026-11-02T10:00:00.000Z', id: 'like:g:u' });
    expect(s).toBe('2026-11-02T10:00:00.000Z|like:g:u');
    expect(feedCursorSchema.parse(s)).toEqual({ at: new Date('2026-11-02T10:00:00.000Z'), id: 'like:g:u' });
  });
  it('rejects bad cursors', () => {
    for (const bad of ['', 'x|y', '2026-11-02T10:00:00.000Z|', 'a'.repeat(121)]) {
      expect(feedCursorSchema.safeParse(bad).success).toBe(false);
    }
  });
  it('validates like and seen payloads', () => {
    expect(feedLikeSchema.parse({ liked: true })).toEqual({ liked: true });
    expect(feedLikeSchema.safeParse({}).success).toBe(false);
    expect(feedLikeSchema.safeParse({ liked: 'yes' }).success).toBe(false);
    expect(feedLikeSchema.safeParse({ liked: true, x: 1 }).success).toBe(false);
    expect(feedSeenSchema.safeParse({ upTo: 'вчора' }).success).toBe(false);
    expect(feedSeenSchema.safeParse({ upTo: '2026-11-02T10:00:00.000Z' }).success).toBe(true);
    expect(feedSeenSchema.safeParse({ upTo: '2026-11-02T10:00:00.000Z', x: 1 }).success).toBe(false);
  });
  it('lists the kinds', () => {
    expect([...FEED_KINDS]).toEqual(['game', 'achievement', 'level', 'prize', 'like']);
  });
});
