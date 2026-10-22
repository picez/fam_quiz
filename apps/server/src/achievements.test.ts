import type { PlayedGame } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { achievementsOf, bestStreak, isPerfect } from './achievements';
import { PENALTY_ATTEMPT } from './db/schema';

const m = (questionIndex: number, accepted: boolean, attempt = 0) => ({ questionIndex, attempt, accepted });

const played = (status: PlayedGame['status'] = 'finished'): PlayedGame => ({
  gameId: 'g1',
  title: 'Гра',
  status,
  startedAt: new Date(0).toISOString(),
  nickname: 'Олена',
  score: 0,
  rank: 1,
  playerCount: 2,
  correct: 0,
  answered: 0,
  questionsPlayed: 10,
});

const fiveRight = [0, 1, 2, 3, 4].map((i) => m(i, true));

describe('bestStreak', () => {
  it('bestStreak counts consecutive accepted questions and breaks on a wrong one', () => {
    expect(bestStreak([m(0, true), m(1, true), m(2, false), m(3, true)])).toBe(2);
    // запитання без рядка (2) не обриває: 0,1,3,4,5 зараховані → 5
    expect(bestStreak([m(0, true), m(1, true), m(3, true), m(4, true), m(5, true)])).toBe(5);
    // бліц: невдала спроба, потім вдала на тому ж запитанні — зараховане
    expect(bestStreak([m(0, true), m(1, false, 0), m(1, true, 1), m(2, true)])).toBe(3);
    // штрафний рядок не є відповіддю
    expect(bestStreak([m(0, true), m(1, false, PENALTY_ATTEMPT), m(2, true)])).toBe(2);
    expect(bestStreak([])).toBe(0);
  });

  it('follows the question order, not the row order', () => {
    expect(bestStreak([m(2, true), m(0, true), m(1, false), m(3, true)])).toBe(2);
  });
});

describe('isPerfect', () => {
  it('isPerfect needs a finished game, five answered questions and no refused attempt', () => {
    expect(isPerfect({ played: played(), marks: fiveRight })).toBe(true);
    expect(isPerfect({ played: played(), marks: fiveRight.slice(0, 4) })).toBe(false);
    expect(isPerfect({ played: played('aborted'), marks: fiveRight })).toBe(false);
    expect(isPerfect({ played: played('running'), marks: fiveRight })).toBe(false);
    expect(isPerfect({ played: played(), marks: [...fiveRight, m(5, false)] })).toBe(false);
    expect(isPerfect({ played: played(), marks: [...fiveRight, m(5, false, PENALTY_ATTEMPT)] })).toBe(true);
  });

  it('a penalty row is not an answered question', () => {
    expect(isPerfect({ played: played(), marks: [...fiveRight.slice(0, 4), m(4, false, PENALTY_ATTEMPT)] })).toBe(false);
  });
});

describe('achievementsOf', () => {
  it('achievementsOf lists all eight in order with thresholds', () => {
    expect(achievementsOf({ games: 0, wins: 0, hosted: 0, bestStreak: 0, perfectGames: 0 }).map((a) => a.earned)).toEqual(
      Array(8).fill(false),
    );
    expect(
      achievementsOf({ games: 10, wins: 1, hosted: 1, bestStreak: 5, perfectGames: 1 })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host']);
    expect(
      achievementsOf({ games: 50, wins: 10, hosted: 0, bestStreak: 4, perfectGames: 0 })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'first_win', 'games_10', 'games_50', 'wins_10']);
  });

  it('just below each threshold earns nothing', () => {
    const earned = achievementsOf({ games: 9, wins: 0, hosted: 0, bestStreak: 4, perfectGames: 0 }).filter((a) => a.earned);
    expect(earned.map((a) => a.id)).toEqual(['first_game']);
    expect(achievementsOf({ games: 49, wins: 9, hosted: 0, bestStreak: 0, perfectGames: 0 }).map((a) => a.id)).toEqual([
      'first_game',
      'first_win',
      'games_10',
      'streak_5',
      'perfect_game',
      'host',
      'games_50',
      'wins_10',
    ]);
    expect(
      achievementsOf({ games: 49, wins: 9, hosted: 0, bestStreak: 0, perfectGames: 0 })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'first_win', 'games_10']);
  });
});
