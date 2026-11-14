import { describe, expect, it } from 'vitest';
import { gameAchievements } from './game-achievements';
import { achievementsFor, hostAchievements } from './host-achievements';
import { fakeGame, q, range, row, SOLO } from './testing/achievement-fixtures';

/** Гра на n запитань, яку вела u-host. */
const hosted = (n: number, patch: Parameters<typeof fakeGame>[0] = {}) => fakeGame({ questions: range(n).map((i) => q(i)), ...patch });

describe('hostAchievements (33)', () => {
  it('host_marathon: a finished game of at least 50 questions hosted by hand', () => {
    expect(hostAchievements(hosted(50), 'u-host')).toEqual(['host_marathon']);
    expect(hostAchievements(hosted(49), 'u-host')).toEqual([]);
    expect(hostAchievements(hosted(50, { autopilot: true }), 'u-host')).toEqual([]);
    expect(hostAchievements(hosted(50), 'u-olya')).toEqual([]);
    expect(hostAchievements(hosted(50, { status: 'aborted' }), 'u-host')).toEqual([]);
  });
});

describe('achievementsFor (33)', () => {
  it('a host who did not play gets only host_marathon; a player gets what gameAchievements gives', () => {
    const game = hosted(50, { rows: [row(0)] });
    expect(achievementsFor(game, 'u-host')).toEqual(['host_marathon']);
    expect(achievementsFor(game, 'u-olya')).toEqual(gameAchievements(game, SOLO));
    expect(achievementsFor(game, 'u-olya')).not.toContain('host_marathon');
    expect(achievementsFor(game, 'u-nobody')).toEqual([]);
  });

  it('someone who hosted and played gets both, in catalogue order', () => {
    const game = hosted(50, { hostId: 'u-olya', rows: [row(0)] });
    const got = achievementsFor(game, 'u-olya');
    expect(got).toContain('host_marathon');
    expect(got).toEqual(expect.arrayContaining(gameAchievements(game, SOLO)));
    expect(got.at(-1)).toBe('host_marathon');
  });
});
