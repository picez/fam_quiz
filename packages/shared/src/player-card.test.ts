import { describe, expect, it } from 'vitest';
import { ADMIN_CARD_GAMES, DELETED_NICKNAME, adminGiftSchema, adminGrantSchema, adminXpSchema } from './player-card';

describe('player card (58)', () => {
  it('manual xp is a non-zero integer within 5000 with a reason up to 200', () => {
    expect(adminXpSchema.parse({ amount: 300, reason: 'Перемога в турнірі' })).toEqual({ amount: 300, reason: 'Перемога в турнірі' });
    expect(adminXpSchema.parse({ amount: -5000, reason: 'x' })).toEqual({ amount: -5000, reason: 'x' });
    expect(adminXpSchema.parse({ amount: 1, reason: '  два   слова ' }).reason).toBe('два слова');
    expect(adminXpSchema.safeParse({ amount: 0, reason: 'x' }).success).toBe(false);
    expect(adminXpSchema.safeParse({ amount: 5001, reason: 'x' }).success).toBe(false);
    expect(adminXpSchema.safeParse({ amount: -5001, reason: 'x' }).success).toBe(false);
    expect(adminXpSchema.safeParse({ amount: 1.5, reason: 'x' }).success).toBe(false);
    expect(adminXpSchema.safeParse({ amount: 10, reason: '   ' }).success).toBe(false);
    expect(adminXpSchema.safeParse({ amount: 10, reason: 'a'.repeat(201) }).success).toBe(false);
    expect(adminXpSchema.safeParse({ amount: 10, reason: 'a'.repeat(200) }).success).toBe(true);
    expect(adminXpSchema.safeParse({ amount: 10, reason: 'x', extra: 1 }).success).toBe(false);
  });

  it('a gift note is optional and up to 120', () => {
    const prizeId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
    expect(adminGiftSchema.parse({ prizeId })).toEqual({ prizeId, note: null });
    expect(adminGiftSchema.parse({ prizeId, note: null })).toEqual({ prizeId, note: null });
    expect(adminGiftSchema.parse({ prizeId, note: 'З днем народження' })).toEqual({ prizeId, note: 'З днем народження' });
    expect(adminGiftSchema.safeParse({ prizeId, note: 'a'.repeat(121) }).success).toBe(false);
    expect(adminGiftSchema.safeParse({ prizeId: 'abc' }).success).toBe(false);
    expect(adminGiftSchema.safeParse({ prizeId, extra: 1 }).success).toBe(false);
  });

  it('only a known achievement can be granted', () => {
    expect(adminGrantSchema.parse({ achievementId: 'first_win' })).toEqual({ achievementId: 'first_win' });
    expect(adminGrantSchema.safeParse({ achievementId: 'nope' }).success).toBe(false);
  });

  it('the deleted player mark is data', () => {
    expect(DELETED_NICKNAME).toBe('Видалений гравець');
    expect(ADMIN_CARD_GAMES).toBe(20);
  });
});
