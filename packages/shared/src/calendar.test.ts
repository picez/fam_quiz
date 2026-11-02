import { describe, expect, it } from 'vitest';
import { CALENDAR_MISSED_AFTER_MS, CALENDAR_STATES, calendarDecisionSchema, calendarInputSchema } from './calendar';

const quizId = '3f0c1c1e-5b1e-4c55-9d53-0c6f1f6c2a11';
const ok = { title: '  Вечір загадок ', startsAt: '2026-11-07T17:00:00.000Z', quizId };

describe('calendar', () => {
  it('trims the title', () => {
    expect(calendarInputSchema.parse(ok).title).toBe('Вечір загадок');
  });

  it('rejects bad input', () => {
    expect(calendarInputSchema.safeParse({ ...ok, title: '   ' }).success).toBe(false);
    expect(calendarInputSchema.safeParse({ ...ok, title: 'а'.repeat(81) }).success).toBe(false);
    expect(calendarInputSchema.safeParse({ ...ok, title: 'а'.repeat(80) }).success).toBe(true);
    expect(calendarInputSchema.safeParse({ ...ok, startsAt: 'завтра' }).success).toBe(false);
    expect(calendarInputSchema.safeParse({ ...ok, quizId: 'q1' }).success).toBe(false);
    expect(calendarInputSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it('decision schema', () => {
    expect(calendarDecisionSchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(calendarDecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
    expect(calendarDecisionSchema.safeParse({ decision: 'approved', x: 1 }).success).toBe(false);
  });

  it('constants', () => {
    expect(CALENDAR_MISSED_AFTER_MS).toBe(21_600_000);
    expect([...CALENDAR_STATES]).toEqual(['planned', 'open', 'played', 'missed', 'cancelled']);
  });
});
