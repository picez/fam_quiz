import type { PlayedGame } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { achievementsOf, bestStreak, friendsPlayedWith, hitFinal, isComeback, isPerfect, winStreak, wonBlitzRound } from './achievements';
import type { GameTable, TableRow } from './history';
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

const zero = { winStreak: 0, blitzWins: 0, finalHits: 0, comebacks: 0, friendsPlayedWith: 0 };
const table = (roundTypes: GameTable['roundTypes'], players: GameTable['players']): GameTable => ({
  gameId: 'g',
  status: 'finished',
  startedAt: new Date(0).toISOString(),
  roundTypes,
  players,
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
  it('achievementsOf lists all sixteen in order with thresholds', () => {
    expect(achievementsOf({ games: 0, wins: 0, hosted: 0, bestStreak: 0, perfectGames: 0, ...zero }).map((a) => a.earned)).toEqual(
      Array(16).fill(false),
    );
    expect(
      achievementsOf({ games: 10, wins: 1, hosted: 1, bestStreak: 5, perfectGames: 1, ...zero })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host']);
    expect(
      achievementsOf({ games: 50, wins: 10, hosted: 0, bestStreak: 4, perfectGames: 0, ...zero })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'first_win', 'games_10', 'games_50', 'wins_10']);
    const base = { games: 0, wins: 0, hosted: 0, bestStreak: 0, perfectGames: 0, ...zero };
    expect(
      achievementsOf({ ...base, games: 100, hosted: 10, bestStreak: 10, winStreak: 3, blitzWins: 1, finalHits: 1, comebacks: 1, friendsPlayedWith: 5 })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'games_10', 'streak_5', 'host', 'games_50', 'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5']);
  });

  it('just below each threshold earns nothing', () => {
    const earned = achievementsOf({ games: 9, wins: 0, hosted: 0, bestStreak: 4, perfectGames: 0, ...zero }).filter((a) => a.earned);
    expect(earned.map((a) => a.id)).toEqual(['first_game']);
    expect(achievementsOf({ games: 49, wins: 9, hosted: 0, bestStreak: 0, perfectGames: 0, ...zero }).map((a) => a.id)).toEqual([
      'first_game',
      'first_win',
      'games_10',
      'streak_5',
      'perfect_game',
      'host',
      'games_50',
      'wins_10',
      'games_100',
      'host_10',
      'streak_10',
      'win_streak_3',
      'blitz_win',
      'final_hit',
      'comeback',
      'friends_5',
    ]);
    expect(
      achievementsOf({ games: 49, wins: 9, hosted: 0, bestStreak: 0, perfectGames: 0, ...zero })
        .filter((a) => a.earned)
        .map((a) => a.id),
    ).toEqual(['first_game', 'first_win', 'games_10']);
  });
});

describe('new achievements', () => {
  it('just below the new thresholds earns nothing', () => {
    const below = { games: 99, wins: 0, hosted: 9, bestStreak: 9, perfectGames: 0, winStreak: 2, blitzWins: 0, finalHits: 0, comebacks: 0, friendsPlayedWith: 4 };
    expect(achievementsOf(below).filter((a) => a.earned).map((a) => a.id)).toEqual(['first_game', 'games_10', 'streak_5', 'host', 'games_50']);
  });

  it('winStreak counts consecutive wins over finished games in start order and skips aborted ones', () => {
    const g = (i: number, rank: number, status: PlayedGame['status'] = 'finished') =>
      ({ ...played(status), gameId: `g${i}`, startedAt: new Date(i * 1000).toISOString(), rank, score: 10 });
    // Новіші першими, як віддає playerGames.
    expect(winStreak([g(5, 1), g(4, 1, 'aborted'), g(3, 1), g(2, 1), g(1, 2)])).toBe(3);
    expect(winStreak([g(3, 1), g(2, 2), g(1, 1)])).toBe(1);
    expect(winStreak([])).toBe(0);
  });

  it('blitz_win needs a strict lead and comeback needs to trail before the last round', () => {
    const row = (roundIndex: number, points: number, accepted = points > 0) => ({ roundIndex, attempt: 0, accepted, points });
    const p = (id: string, rank: number, score: number, rows: TableRow[]) => ({ participantId: id, userId: id, rank, score, rows });
    const blitz = table(['blitz', 'classic'], [p('a', 1, 30, [row(0, 20), row(1, 10)]), p('b', 2, 20, [row(0, 20)])]);
    expect(wonBlitzRound(blitz, 'a')).toBe(false); // 20 = 20
    const lead = table(['classic', 'blitz'], [p('a', 1, 30, [row(1, 30)]), p('b', 2, 10, [row(1, 20), row(1, -10, false)])]);
    expect(wonBlitzRound(lead, 'a')).toBe(true);
    expect(wonBlitzRound(table(['blitz'], [p('a', 1, 30, [row(0, 30)])]), 'a')).toBe(false); // сам

    const back = table(['classic', 'final'], [p('a', 1, 50, [row(0, 10), row(1, 40)]), p('b', 2, 20, [row(0, 20)])]);
    expect(isComeback(back, 'a')).toBe(true);
    expect(hitFinal(back, 'a')).toBe(true);
    expect(hitFinal(back, 'b')).toBe(false);
    const ahead = table(['classic', 'final'], [p('a', 1, 50, [row(0, 30), row(1, 20)]), p('b', 2, 20, [row(0, 20)])]);
    expect(isComeback(ahead, 'a')).toBe(false);
    const oneRound = table(['classic', 'final'], [p('a', 1, 30, [row(0, 30)]), p('b', 2, 20, [row(0, 20)])]);
    expect(isComeback(oneRound, 'a')).toBe(false);
  });

  it('friendsPlayedWith counts distinct friends other than the player', () => {
    const p = (userId: string | null) => ({ participantId: `${userId}-p`, userId, rank: null, score: 0, rows: [] });
    const tables = [table(['classic'], [p('me'), p('f1'), p('f2'), p(null)]), table(['classic'], [p('me'), p('f1'), p('x')])];
    expect(friendsPlayedWith(tables, 'me', new Set(['f1', 'f2', 'f3', 'me']))).toBe(2);
  });
});
