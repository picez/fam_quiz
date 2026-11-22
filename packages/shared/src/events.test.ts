import { describe, expect, it } from 'vitest';
import { answerSchema } from './answer';
import { botCommandSchema } from './bot';
import { adjustSchema, wagerSchema } from './events';
import { adminXpSchema } from './player-card';

const JUNK = ['300', '3e2', '', 'abc', null, true, Number.NaN, Number.POSITIVE_INFINITY, 1.5, [300], { amount: 300 }];

describe('numeric payloads reject anything but a number', () => {
  it('a wager (bets, auction bid, final) is a non-negative integer', () => {
    expect(wagerSchema.safeParse({ amount: 300 }).success).toBe(true);
    expect(wagerSchema.safeParse({ amount: 0, allIn: true }).success).toBe(true);
    expect(wagerSchema.safeParse({ amount: -1 }).success).toBe(false);
    for (const amount of JUNK) expect(wagerSchema.safeParse({ amount }).success, String(amount)).toBe(false);
  });

  it('a host and bot adjust is a signed integer, not zero', () => {
    expect(adjustSchema.safeParse({ playerId: 'p1', points: -150 }).success).toBe(true);
    expect(adjustSchema.safeParse({ playerId: 'p1', points: 0 }).success).toBe(false);
    for (const points of JUNK) expect(adjustSchema.safeParse({ playerId: 'p1', points }).success, String(points)).toBe(false);
    expect(botCommandSchema.safeParse({ type: 'adjust', playerId: 'p1', points: -20 }).success).toBe(true);
    for (const points of JUNK) expect(botCommandSchema.safeParse({ type: 'adjust', playerId: 'p1', points }).success, String(points)).toBe(false);
  });

  it('the admin experience change is a signed integer', () => {
    expect(adminXpSchema.safeParse({ amount: -5, reason: 'тест' }).success).toBe(true);
    for (const amount of JUNK) expect(adminXpSchema.safeParse({ amount, reason: 'тест' }).success, String(amount)).toBe(false);
  });

  it('a numeric answer is a finite number', () => {
    expect(answerSchema.safeParse({ type: 'numeric', value: -2.5 }).success).toBe(true);
    for (const value of ['12', 'abc', null, Number.NaN, Number.POSITIVE_INFINITY]) expect(answerSchema.safeParse({ type: 'numeric', value }).success, String(value)).toBe(false);
  });
});
