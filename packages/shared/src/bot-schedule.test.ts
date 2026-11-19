import { describe, expect, it } from 'vitest';
import { BOT_PLAN_LATE_MS, BOT_PLAN_REMIND_MS, BOT_PLAN_STATUSES, BOT_PLANS_MAX, botPlanInputSchema } from './bot-schedule';

const quizId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const groupId = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const base = { quizId, startsAt: '2026-11-20T17:00:00.000Z', recipients: { kind: 'none' }, autoStartMin: null, weekly: false };

describe('botPlanInputSchema', () => {
  it('a plan input: a bot quiz, a moment, recipients, an optional auto start and a weekly flag', () => {
    expect(botPlanInputSchema.parse(base)).toEqual(base);
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'all' } }).success).toBe(true);
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'group', groupId } }).success).toBe(true);
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'people', userIds: ['a1', 'b2'] }, autoStartMin: 10, weekly: true }).success).toBe(true);
    expect(botPlanInputSchema.safeParse({ ...base, autoStartMin: 5 }).success).toBe(true);
    expect(botPlanInputSchema.safeParse({ ...base, autoStartMin: 30 }).success).toBe(true);
    for (const autoStartMin of [4, 31, 7.5]) expect(botPlanInputSchema.safeParse({ ...base, autoStartMin }).success).toBe(false);
    const fiftyOne = Array.from({ length: 51 }, (_, i) => `u${i}`);
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'people', userIds: fiftyOne.slice(0, 50) } }).success).toBe(true);
    for (const userIds of [[], fiftyOne, ['a1', 'a1']]) {
      expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'people', userIds } }).success).toBe(false);
    }
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'group' } }).success).toBe(false);
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'group', groupId: 'x' } }).success).toBe(false);
    expect(botPlanInputSchema.safeParse({ ...base, recipients: { kind: 'all', groupId } }).success).toBe(false);
    expect(botPlanInputSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(botPlanInputSchema.safeParse({ ...base, startsAt: '20.11.2026 19:00' }).success).toBe(false);
    expect(botPlanInputSchema.safeParse({ ...base, quizId: 'nope' }).success).toBe(false);
  });

  it('limits', () => {
    expect(BOT_PLANS_MAX).toBe(20);
    expect(BOT_PLAN_REMIND_MS).toBe(900_000);
    expect(BOT_PLAN_LATE_MS).toBe(600_000);
    expect([...BOT_PLAN_STATUSES]).toEqual(['scheduled', 'opened', 'played', 'nobody', 'cancelled', 'failed']);
  });
});
