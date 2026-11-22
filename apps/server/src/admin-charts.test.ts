import { describe, expect, it } from 'vitest';
import { kyivDayList, shiftDay, weeklyReturns } from './admin-charts';

const sets = (...ids: string[]) => new Set(ids);

describe('chart days', () => {
  it('lists 30 Kyiv days, oldest first', () => {
    const days = kyivDayList(new Date('2026-11-19T10:00:00Z'), 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-10-21');
    expect(days[29]).toBe('2026-11-19');
  });

  it('shifts calendar days across a clock change and a month edge', () => {
    expect(shiftDay('2026-10-26', -1)).toBe('2026-10-25');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts week-over-week returns', () => {
    const byDay = new Map<string, ReadonlySet<string>>([
      ['2026-11-10', sets('a', 'b', 'c')],
      ['2026-11-12', sets('d')],
      ['2026-11-18', sets('a', 'b', 'e')],
    ]);
    expect(weeklyReturns(byDay, '2026-11-19')).toBe(50);
    expect(weeklyReturns(new Map([['2026-11-18', sets('a')]]), '2026-11-19')).toBeNull();
  });
});
