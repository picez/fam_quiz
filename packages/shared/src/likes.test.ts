import { describe, expect, it } from 'vitest';
import { LIKE_KINDS, LIKE_RATE, likeSchema } from './likes';

describe('likeSchema', () => {
  it('accepts the wished state of every target', () => {
    expect(likeSchema.safeParse({ target: 'question', liked: true }).success).toBe(true);
    expect(likeSchema.safeParse({ target: 'quiz', liked: false }).success).toBe(true);
    expect(likeSchema.safeParse({ target: 'host', liked: true }).success).toBe(true);
    expect(likeSchema.safeParse({ target: 'player', id: 'p1', liked: false }).success).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(likeSchema.safeParse({ target: 'player', liked: true }).success).toBe(false);
    expect(likeSchema.safeParse({ target: 'player', id: '', liked: true }).success).toBe(false);
    expect(likeSchema.safeParse({ target: 'player', id: 'x'.repeat(65), liked: true }).success).toBe(false);
    expect(likeSchema.safeParse({ target: 'question', liked: 'yes' }).success).toBe(false);
    expect(likeSchema.safeParse({ target: 'question', liked: true, extra: 1 }).success).toBe(false);
    expect(likeSchema.safeParse({ target: 'event', liked: true }).success).toBe(false);
    expect(likeSchema.safeParse({ target: 'question', id: 'p1', liked: true }).success).toBe(false);
  });

  it('lists the four kinds and a rate window', () => {
    expect([...LIKE_KINDS]).toEqual(['question', 'quiz', 'host', 'player']);
    expect(LIKE_RATE).toEqual({ windowMs: 10_000, max: 12 });
  });
});
