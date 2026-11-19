import { describe, expect, it } from 'vitest';
import { kyivWallTime, nextWeekKyiv } from './kyiv-time';

describe('nextWeekKyiv', () => {
  it('the same Kyiv wall clock a week later across both clock changes', () => {
    // 19:00 літнього часу (+3) → 19:00 зимового (+2) після 25.10.2026.
    expect(nextWeekKyiv(new Date('2026-10-20T16:00:00Z')).toISOString()).toBe('2026-10-27T17:00:00.000Z');
    // 19:00 зимового (+2) → 19:00 літнього (+3) після 28.03.2027.
    expect(nextWeekKyiv(new Date('2027-03-23T17:00:00Z')).toISOString()).toBe('2027-03-30T16:00:00.000Z');
    expect(nextWeekKyiv(new Date('2026-11-20T17:00:00Z')).toISOString()).toBe('2026-11-27T17:00:00.000Z');
  });

  it('keeps minutes and seconds and crosses a month and a year', () => {
    expect(nextWeekKyiv(new Date('2026-12-28T18:30:15.250Z')).toISOString()).toBe('2027-01-04T18:30:15.250Z');
    // 23:30 у Києві 31.10 (уже зимовий) → 23:30 07.11.
    expect(nextWeekKyiv(new Date('2026-10-31T21:30:00Z')).toISOString()).toBe('2026-11-07T21:30:00.000Z');
  });

  it('the Kyiv wall time of a moment as HH:MM', () => {
    expect(kyivWallTime(new Date('2026-11-20T17:05:00Z'))).toBe('19:05');
    expect(kyivWallTime(new Date('2026-07-01T00:30:00Z'))).toBe('03:30');
  });

  it('a 03:30 weekly series stepped across the spring gap comes back to 03:30', () => {
    // 21.03.2027 03:30 (+2) → 28.03 03:30 не існує → 04:30 (+3) → 04.04 знову 03:30 (+3).
    const gap = nextWeekKyiv(new Date('2027-03-21T01:30:00Z'), '03:30');
    expect(gap.toISOString()).toBe('2027-03-28T01:30:00.000Z');
    expect(kyivWallTime(gap)).toBe('04:30');
    expect(nextWeekKyiv(gap, '03:30').toISOString()).toBe('2027-04-04T00:30:00.000Z');
    // Без настінного часу серія лишилася б о 04:30.
    expect(nextWeekKyiv(gap).toISOString()).toBe('2027-04-04T01:30:00.000Z');
  });
});
