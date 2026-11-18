import { describe, expect, it } from 'vitest';
import {
  LEAGUE_MONTH,
  leagueOrder,
  leagueOutcome,
  leaguePickSchema,
  monthWinners,
  previousMonth,
  rankLeague,
  type LeagueTotals,
} from './league';

const set = (...ids: string[]) => new Set(ids);
const tot = (userId: string, points: number, firsts: number, games: number, nickname = userId): LeagueTotals => ({ userId, nickname, points, firsts, games });

describe('leagueOutcome', () => {
  it('places among members, guests and outsiders take no place', () => {
    const out = leagueOutcome(
      [
        { rank: 1, userIds: ['x'] },
        { rank: 2, userIds: ['u1'] },
        { rank: 3, userIds: [] },
        { rank: 4, userIds: ['u2'] },
        { rank: 5, userIds: ['u3'] },
      ],
      set('u1', 'u2', 'u3'),
    );
    expect(out.counted).toBe(true);
    expect(out.members).toBe(3);
    expect(out.rows).toEqual([
      { userId: 'u1', place: 1, points: 10 },
      { userId: 'u2', place: 2, points: 7 },
      { userId: 'u3', place: 3, points: 5 },
    ]);
  });

  it('a tie shares the place and skips the next', () => {
    const three = leagueOutcome(
      [
        { rank: 1, userIds: ['u1'] },
        { rank: 1, userIds: ['u2'] },
        { rank: 3, userIds: ['u3'] },
      ],
      set('u1', 'u2', 'u3'),
    );
    expect(three.rows.map((r) => [r.place, r.points])).toEqual([[1, 10], [1, 10], [3, 5]]);
    const four = leagueOutcome(
      [
        { rank: 1, userIds: ['u1'] },
        { rank: 2, userIds: ['u2'] },
        { rank: 2, userIds: ['u3'] },
        { rank: 4, userIds: ['u4'] },
      ],
      set('u1', 'u2', 'u3', 'u4'),
    );
    expect(four.rows.map((r) => r.points)).toEqual([10, 7, 7, 3]);
  });

  it('sixth and lower get zero but still count', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
    const out = leagueOutcome(ids.map((u, i) => ({ rank: i + 1, userIds: [u] })), new Set(ids));
    expect(out.rows.map((r) => r.points)).toEqual([10, 7, 5, 3, 1, 0, 0]);
    expect(out.rows).toHaveLength(7);
  });

  it("teams: members get their team's place among teams with members", () => {
    const out = leagueOutcome(
      [
        { rank: 1, userIds: ['u1', 'x'] },
        { rank: 2, userIds: ['g'] },
        { rank: 3, userIds: ['u2', 'u3'] },
      ],
      set('u1', 'u2', 'u3'),
    );
    expect(out.counted).toBe(true);
    expect(out.rows).toEqual([
      { userId: 'u1', place: 1, points: 10 },
      { userId: 'u2', place: 2, points: 7 },
      { userId: 'u3', place: 2, points: 7 },
    ]);
  });

  it('too few', () => {
    const two = leagueOutcome(
      [
        { rank: 1, userIds: ['u1'] },
        { rank: 2, userIds: ['u2'] },
        { rank: 3, userIds: ['a'] },
        { rank: 4, userIds: ['b'] },
        { rank: 5, userIds: ['c'] },
      ],
      set('u1', 'u2'),
    );
    expect(two).toEqual({ counted: false, members: 2, rows: [] });
    const oneTeam = leagueOutcome([{ rank: 1, userIds: ['u1', 'u2', 'u3'] }], set('u1', 'u2', 'u3'));
    expect(oneTeam.counted).toBe(false);
    expect(oneTeam.rows).toEqual([]);
  });

  it('one person in two entries takes the better place once', () => {
    const out = leagueOutcome(
      [
        { rank: 1, userIds: ['u1'] },
        { rank: 2, userIds: ['u2'] },
        { rank: 3, userIds: ['u1', 'u3'] },
      ],
      set('u1', 'u2', 'u3'),
    );
    expect(out.rows.filter((r) => r.userId === 'u1')).toEqual([{ userId: 'u1', place: 1, points: 10 }]);
    expect(out.rows).toHaveLength(3);
    expect(out.members).toBe(3);
  });
});

describe('table order and shared places', () => {
  it('ranks by points, firsts, games, then nickname, sharing the place for an equal triple', () => {
    const rows = rankLeague([tot('d', 15, 1, 2), tot('c', 20, 1, 4), tot('b', 20, 2, 3), tot('a', 20, 2, 3)]);
    expect(rows.map((r) => [r.userId, r.place])).toEqual([['a', 1], ['b', 1], ['c', 3], ['d', 4]]);
    expect([tot('b', 1, 1, 1), tot('a', 1, 1, 1)].sort(leagueOrder).map((r) => r.userId)).toEqual(['a', 'b']);
  });

  it('month winners', () => {
    expect(monthWinners([tot('a', 20, 2, 3), tot('b', 20, 2, 3), tot('c', 10, 5, 9)]).map((r) => r.userId).sort()).toEqual(['a', 'b']);
    expect(monthWinners([tot('a', 20, 2, 3), tot('b', 20, 3, 3)]).map((r) => r.userId)).toEqual(['b']);
    expect(monthWinners([tot('a', 20, 2, 3), tot('b', 20, 2, 4)]).map((r) => r.userId)).toEqual(['b']);
    expect(monthWinners([])).toEqual([]);
  });
});

describe('months and pick', () => {
  it('validates and steps months', () => {
    expect(LEAGUE_MONTH.test('2026-11')).toBe(true);
    expect(LEAGUE_MONTH.test('2026-13')).toBe(false);
    expect(LEAGUE_MONTH.test('2026-1')).toBe(false);
    expect(LEAGUE_MONTH.test('26-11')).toBe(false);
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });

  it('the pick schema takes null or a uuid and nothing else', () => {
    expect(leaguePickSchema.safeParse({ groupId: null }).success).toBe(true);
    expect(leaguePickSchema.safeParse({ groupId: '0b0f3f0e-6b1c-4a52-9f6e-2d3c4b5a6f70' }).success).toBe(true);
    expect(leaguePickSchema.safeParse({ groupId: 'abc' }).success).toBe(false);
    expect(leaguePickSchema.safeParse({ groupId: null, extra: 1 }).success).toBe(false);
  });
});
