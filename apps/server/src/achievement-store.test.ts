import { ACHIEVEMENTS } from '@quiz/shared';
import { blitzRound, classicRound, makeRoundsQuiz, single, slider, withId } from '@quiz/engine/testing';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as games from './achievement-games';
import { achievementsPage, awardGame, careerFacts, syncAchievements } from './achievement-store';
import type { Db } from './db/client';
import { PENALTY_ATTEMPT, profile, quiz, user, userAchievement } from './db/schema';
import * as history from './history';
import { publicProfile, setFollow } from './profiles';
import { seedGame, type SeedPlayer } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

vi.mock('./achievement-games', async (importOriginal) => {
  const original = await importOriginal<typeof import('./achievement-games')>();
  return { ...original, loadAchievementGames: vi.fn(original.loadAchievementGames) };
});

vi.mock('./history', async (importOriginal) => {
  const original = await importOriginal<typeof import('./history')>();
  return {
    ...original,
    playerGames: vi.fn(original.playerGames),
    answeredTypes: vi.fn(original.answeredTypes),
    answeredTypesAround: vi.fn(original.answeredTypesAround),
  };
});

const HOST = 'store-host';

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await addUser(HOST, 'Ведуча');
});

beforeEach(() => {
  vi.mocked(games.loadAchievementGames).mockClear();
  clearHistorySpies();
});

function clearHistorySpies() {
  vi.mocked(history.playerGames).mockClear();
  vi.mocked(history.answeredTypes).mockClear();
  vi.mocked(history.answeredTypesAround).mockClear();
}

/** Скільки разів читали типи запитань користувача userId (будь-яким способом). */
const typeReads = (userId: string) =>
  [...vi.mocked(history.answeredTypes).mock.calls, ...vi.mocked(history.answeredTypesAround).mock.calls].filter(([, id]) => id === userId).length;
/** Скільки разів читали ігри користувача userId. */
const gameReads = (userId: string) => vi.mocked(history.playerGames).mock.calls.filter(([, id]) => id === userId).length;

async function addUser(id: string, name: string) {
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
}

const quizOne = makeRoundsQuiz([classicRound('r1', [single, slider])]);
const playsOne = [
  { roundIndex: 0, questionId: single.id },
  { roundIndex: 0, questionId: slider.id },
];
const guest: SeedPlayer = { userId: null, nickname: 'Тарас', score: 0, rank: 2 };

/** Завершена гра на два запитання: перше — single за timeMs, друге — повзунок зі значенням value (null — без відповіді). */
async function playGame(
  userId: string,
  startedAt: Date,
  { timeMs = 5000, value = null, hostId = HOST, quizId, autopilot }: { timeMs?: number; value?: number | null; hostId?: string; quizId?: string; autopilot?: boolean } = {},
) {
  return seedGame(db, {
    hostId,
    quizId,
    autopilot,
    startedAt,
    finishedAt: new Date(startedAt.getTime() + 30 * 60_000),
    snapshot: quizOne,
    questionsPlayed: 2,
    plays: playsOne,
    players: [
      {
        userId,
        nickname: 'Гравець',
        score: 100,
        rank: 1,
        rows: [
          { questionIndex: 0, accepted: true, points: 100, payload: { type: 'single', optionId: 'b' }, timeMs },
          ...(value === null ? [] : [{ questionIndex: 1, accepted: true, points: 0, payload: { type: 'slider' as const, value }, timeMs: 9000 }]),
        ],
      },
      guest,
    ],
  });
}

const rowsOf = (userId: string) => db.select().from(userAchievement).where(eq(userAchievement.userId, userId));
const read = async (userId: string) => syncAchievements(db, userId, null);

describe('filling the history once', () => {
  it('the first read writes game and career achievements as «long ago», the second inserts nothing and loads no games', async () => {
    const me = 'store-fill';
    await addUser(me, 'Оля');
    await playGame(me, new Date('2026-09-01T18:00:00Z'));
    const second = await playGame(me, new Date('2026-09-02T18:00:00Z'), { timeMs: 1500 });

    const first = await read(me);
    expect([...first.earned.keys()]).toEqual(expect.arrayContaining(['first_game', 'first_win', 'fast_answer']));
    expect(first.fresh).toEqual(expect.arrayContaining(['first_game', 'first_win', 'fast_answer']));
    expect(first.earned.get('fast_answer')).toEqual({ earnedAt: null, gameId: second.gameId });
    expect(first.earned.get('first_game')).toEqual({ earnedAt: null, gameId: null });
    const stored = await rowsOf(me);
    expect(stored.find((r) => r.achievementId === 'fast_answer')).toMatchObject({ earnedAt: null, gameId: second.gameId });
    expect(stored.every((r) => r.earnedAt === null)).toBe(true);
    const [mark] = await db.select().from(profile).where(eq(profile.userId, me));
    expect(mark.achievementsSyncedAt).toBeInstanceOf(Date);
    expect(games.loadAchievementGames).toHaveBeenCalled();

    vi.mocked(games.loadAchievementGames).mockClear();
    const again = await read(me);
    expect(again.fresh).toEqual([]);
    expect(again.earned.size).toBe(first.earned.size);
    expect(games.loadAchievementGames).not.toHaveBeenCalled();
    expect(await rowsOf(me)).toHaveLength(stored.length);
  });

  it('two simultaneous first reads write each achievement once', async () => {
    const me = 'store-race';
    await addUser(me, 'Віра');
    await playGame(me, new Date('2026-09-03T18:00:00Z'), { timeMs: 1500 });
    const [a, b] = await Promise.all([read(me), read(me)]);
    expect(a.earned.get('fast_answer')).toEqual(b.earned.get('fast_answer'));
    const stored = await rowsOf(me);
    expect(stored.filter((r) => r.achievementId === 'fast_answer')).toHaveLength(1);
    expect(new Set([...a.fresh, ...b.fresh]).size).toBe(a.fresh.length + b.fresh.length);
  });
});

describe('a finished game', () => {
  it('awards its players with the finish time and the game; a repeat awards nothing; guests get nothing', async () => {
    const me = 'store-finish';
    await addUser(me, 'Марта');
    await read(me);
    const { gameId } = await playGame(me, new Date('2026-09-05T18:00:00Z'), { timeMs: 1500 });
    const finishedAt = new Date('2026-09-05T18:30:00Z');

    const awarded = await awardGame(db, gameId);
    expect(awarded.get(me)).toEqual(expect.arrayContaining(['first_game', 'first_win', 'fast_answer']));
    expect([...awarded.keys()].every((id) => id !== null)).toBe(true);
    const fast = (await rowsOf(me)).find((r) => r.achievementId === 'fast_answer');
    expect(fast).toMatchObject({ gameId });
    expect(fast?.earnedAt?.toISOString()).toBe(finishedAt.toISOString());
    const first = (await rowsOf(me)).find((r) => r.achievementId === 'first_game');
    expect(first?.earnedAt?.toISOString()).toBe(finishedAt.toISOString());

    const count = (await db.select().from(userAchievement)).length;
    const repeat = await awardGame(db, gameId);
    expect([...repeat.values()].flat()).toEqual([]);
    expect(await db.select().from(userAchievement)).toHaveLength(count);
  });

  it('an unfinished game awards nothing', async () => {
    const me = 'store-aborted';
    await addUser(me, 'Ліна');
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      status: 'aborted',
      startedAt: new Date('2026-09-06T18:00:00Z'),
      players: [{ userId: me, nickname: 'Ліна', score: 100, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 100 }] }, guest],
    });
    expect((await awardGame(db, gameId)).size).toBe(0);
    expect(await rowsOf(me)).toEqual([]);
  });

  it('the host gets host for a hosted game, not for an autopilot one', async () => {
    const host = 'store-hosting';
    const bot = 'store-bot';
    await addUser(host, 'Ведучий');
    await addUser(bot, 'Авторка');
    const hosted = await seedGame(db, { hostId: host, startedAt: new Date('2026-09-07T18:00:00Z'), players: [guest] });
    expect((await awardGame(db, hosted.gameId)).get(host)).toEqual(['host']);
    const row = (await rowsOf(host)).find((r) => r.achievementId === 'host');
    expect(row?.earnedAt?.toISOString()).toBe('2026-09-07T18:00:00.000Z');
    expect(row?.gameId).toBe(hosted.gameId);

    const auto = await seedGame(db, { hostId: bot, autopilot: true, startedAt: new Date('2026-09-07T19:00:00Z'), players: [guest] });
    await awardGame(db, auto.gameId);
    expect((await rowsOf(bot)).map((r) => r.achievementId)).not.toContain('host');
  });

  it('the author who did not play gets author_hit on the tenth finished game of their quiz', async () => {
    const author = 'store-author';
    const player = 'store-reader';
    await addUser(author, 'Авторка');
    await addUser(player, 'Ярема');
    const [own] = await db.insert(quiz).values({ ownerId: author, title: 'Буковина', description: '', settings: quizOne.settings, rounds: quizOne.rounds }).returning();
    for (let i = 0; i < 9; i++) await playGame(player, new Date(`2026-08-${10 + i}T18:00:00Z`), { quizId: own.id });
    const tenth = await playGame(player, new Date('2026-08-25T18:00:00Z'), { quizId: own.id });
    const awarded = await awardGame(db, tenth.gameId);
    expect(awarded.get(author)).toEqual(['author_hit']);
    const row = (await rowsOf(author)).find((r) => r.achievementId === 'author_hit');
    expect(row?.earnedAt?.toISOString()).toBe('2026-08-25T18:30:00.000Z');
    expect(row?.gameId).toBe(tenth.gameId);
  });

  it('a finish before the first read: the old game gives «long ago», the new one its date', async () => {
    const me = 'store-before';
    await addUser(me, 'Ганна');
    await playGame(me, new Date('2026-09-08T18:00:00Z'), { timeMs: 1500 });
    const fresh = await playGame(me, new Date('2026-09-09T18:00:00Z'), { value: 50 });
    const awarded = await awardGame(db, fresh.gameId);
    expect(awarded.get(me)).toEqual(['jeweler']);
    const stored = await rowsOf(me);
    expect(stored.find((r) => r.achievementId === 'fast_answer')?.earnedAt).toBeNull();
    expect(stored.find((r) => r.achievementId === 'first_game')?.earnedAt).toBeNull();
    const jeweler = stored.find((r) => r.achievementId === 'jeweler');
    expect(jeweler?.earnedAt?.toISOString()).toBe('2026-09-09T18:30:00.000Z');
    expect(jeweler?.gameId).toBe(fresh.gameId);
  });

  it('team games: answer achievements go to the person who answered, the result to the whole team', async () => {
    const petro = 'store-petro';
    const olya = 'store-olya';
    await addUser(petro, 'Петро');
    await addUser(olya, 'Оля');
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-09-10T18:00:00Z'),
      snapshot: quizOne,
      questionsPlayed: 1,
      plays: playsOne.slice(0, 1),
      players: [
        {
          userId: null,
          nickname: 'Дніпро',
          score: 100,
          rank: 1,
          isTeam: true,
          rows: [{ questionIndex: 0, accepted: true, points: 100, payload: { type: 'single', optionId: 'b' }, timeMs: 1500, answeredBy: 2 }],
        },
        { userId: null, nickname: 'Чернівці', score: 0, rank: 2, isTeam: true },
        { userId: petro, nickname: 'Петро', score: 100, rank: 1, teamOf: 0 },
        { userId: olya, nickname: 'Оля', score: 100, rank: 1, teamOf: 0 },
        { userId: null, nickname: 'Марко', score: 0, rank: 2, teamOf: 1 },
      ],
    });
    const awarded = await awardGame(db, gameId);
    expect(awarded.get(petro)).toEqual(expect.arrayContaining(['fast_answer', 'team_win']));
    expect(awarded.get(olya)).toContain('team_win');
    expect(awarded.get(olya)).not.toContain('fast_answer');
  });
});

describe('reading', () => {
  it('a career achievement earned later gets the read time and no game, and stays after an unfollow', async () => {
    const me = 'store-friends';
    await addUser(me, 'Соломія');
    const friends = ['a', 'b', 'c', 'd', 'e'].map((s) => `store-friend-${s}`);
    for (const id of friends) await addUser(id, 'Друг');
    await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-09-11T18:00:00Z'),
      players: [me, ...friends].map((userId, i) => ({ userId, nickname: `Гравець ${i}`, score: 0, rank: i + 1 })),
    });
    for (const id of friends.slice(0, 4)) await setFollow(db, me, id, true);
    expect((await read(me)).earned.has('friends_5')).toBe(false);

    await setFollow(db, me, friends[4], true);
    const before = Date.now();
    const { earned, fresh } = await read(me);
    expect(fresh).toEqual(['friends_5']);
    const row = earned.get('friends_5');
    expect(row?.gameId).toBeNull();
    expect(row?.earnedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row?.earnedAt?.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    await setFollow(db, me, friends[4], false);
    expect((await read(me)).earned.has('friends_5')).toBe(true);
    expect((await rowsOf(me)).map((r) => r.achievementId)).toContain('friends_5');
  });

  it('skips stored rows with an unknown id', async () => {
    const me = 'store-gone';
    await addUser(me, 'Дарина');
    await read(me);
    await db.insert(userAchievement).values({ userId: me, achievementId: 'gone' as never, earnedAt: null, gameId: null });
    const { earned } = await read(me);
    expect(earned.has('gone' as never)).toBe(false);
    expect((await rowsOf(me)).map((r) => r.achievementId)).toContain('gone');
  });
});

describe('achievements page', () => {
  it('own: all 48 with progress for unearned counters; public: earned only without progress; unknown: null', async () => {
    const me = 'store-page';
    await addUser(me, 'Яна');
    await playGame(me, new Date('2026-09-12T18:00:00Z'));
    await playGame(me, new Date('2026-09-13T18:00:00Z'));

    const own = await achievementsPage(db, me, true);
    expect(own?.own).toBe(true);
    expect(own?.total).toBe(ACHIEVEMENTS.length);
    expect(own?.items.map((i) => i.id)).toEqual([...ACHIEVEMENTS]);
    expect(own?.earned).toBe(own?.items.filter((i) => i.earned).length);
    expect(own?.profile).toMatchObject({ id: me, nickname: 'Яна' });
    expect(own?.items.find((i) => i.id === 'games_10')?.progress).toEqual({ current: 2, goal: 10 });
    expect(own?.items.find((i) => i.id === 'first_game')).toEqual({ id: 'first_game', earned: true, earnedAt: null, progress: null });
    expect(own?.items.find((i) => i.id === 'fast_answer')?.progress).toBeNull();
    expect(own?.items.filter((i) => i.earned).every((i) => i.progress === null)).toBe(true);

    const pub = await achievementsPage(db, me, false);
    expect(pub?.own).toBe(false);
    expect(pub?.total).toBe(ACHIEVEMENTS.length);
    expect(pub?.items.length).toBe(own?.earned);
    expect(pub?.earned).toBe(own?.earned);
    expect(pub?.items.every((i) => i.earned && i.progress === null)).toBe(true);

    expect(await achievementsPage(db, 'store-nobody', true)).toBeNull();
  });

  it('dates come out as ISO strings', async () => {
    const me = 'store-iso';
    await addUser(me, 'Ірина');
    await read(me);
    const { gameId } = await playGame(me, new Date('2026-09-14T18:00:00Z'));
    await awardGame(db, gameId);
    const page = await achievementsPage(db, me, true);
    expect(page?.items.find((i) => i.id === 'first_game')?.earnedAt).toBe('2026-09-14T18:30:00.000Z');
    const [row] = await db.select().from(userAchievement).where(and(eq(userAchievement.userId, me), eq(userAchievement.achievementId, 'first_game')));
    expect(row.gameId).toBe(gameId);
  });
});

describe('fix wave (12i)', () => {
  it('one user whose award fails does not keep the others from theirs; the error is reported', async () => {
    const bad = 'store-bad';
    const good = 'store-good';
    await addUser(bad, 'Злата');
    await addUser(good, 'Остап');
    const { gameId } = await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-09-15T18:00:00Z'),
      players: [
        { userId: bad, nickname: 'Злата', score: 100, rank: 1 },
        { userId: good, nickname: 'Остап', score: 50, rank: 2 },
      ],
    });
    const original = vi.mocked(history.playerGames).getMockImplementation()!;
    vi.mocked(history.playerGames).mockImplementation((database, userId, limit) =>
      userId === bad ? Promise.reject(new Error('read failed')) : original(database, userId, limit),
    );
    const errors: unknown[] = [];
    try {
      const awarded = await awardGame(db, gameId, (error) => errors.push(error));
      expect(awarded.has(bad)).toBe(false);
      expect(awarded.get(good)).toContain('first_game');
    } finally {
      vi.mocked(history.playerGames).mockImplementation(original);
    }
    expect(errors).toHaveLength(1);
    expect((await rowsOf(good)).map((r) => r.achievementId)).toContain('first_game');
    expect(await rowsOf(bad)).toEqual([]);
  });

  it('a finish before the first read reads the career once: the facts before the game come from the same rows', async () => {
    const me = 'store-once';
    await addUser(me, 'Устим');
    await playGame(me, new Date('2026-09-16T18:00:00Z'));
    const { gameId } = await playGame(me, new Date('2026-09-17T18:00:00Z'));
    clearHistorySpies();
    await awardGame(db, gameId);
    expect(gameReads(me)).toBe(1);
    expect(typeReads(me)).toBe(1);
    const stored = await rowsOf(me);
    expect(stored.find((r) => r.achievementId === 'first_game')?.earnedAt).toBeNull();
    expect(stored.find((r) => r.achievementId === 'first_game')?.gameId).toBeNull();
  });

  it('question types are not read once all_types is stored, nor on another player page or profile', async () => {
    const me = 'store-types';
    await addUser(me, 'Ліза');
    await playGame(me, new Date('2026-09-18T18:00:00Z'));
    await read(me);

    clearHistorySpies();
    await achievementsPage(db, me, false);
    await publicProfile(db, me, HOST);
    expect(typeReads(me)).toBe(0);
    await achievementsPage(db, me, true);
    expect(typeReads(me)).toBe(1);

    await db.insert(userAchievement).values({ userId: me, achievementId: 'all_types', earnedAt: null, gameId: null });
    clearHistorySpies();
    await achievementsPage(db, me, true);
    await read(me);
    expect(typeReads(me)).toBe(0);
  });

  it('a round with only a penalty row is not a played round type', async () => {
    const me = 'store-rounds';
    await addUser(me, 'Тереза');
    const blitzOnly = withId(single, 'store-blitz');
    const twoRounds = makeRoundsQuiz([classicRound('r1', [single]), blitzRound('b1', [blitzOnly])]);
    await seedGame(db, {
      hostId: HOST,
      startedAt: new Date('2026-09-19T18:00:00Z'),
      snapshot: twoRounds,
      questionsPlayed: 2,
      plays: [
        { roundIndex: 0, questionId: single.id },
        { roundIndex: 1, questionId: blitzOnly.id },
      ],
      players: [
        {
          userId: me,
          nickname: 'Тереза',
          score: 0,
          rank: 1,
          rows: [
            { questionIndex: 0, accepted: true, points: 100 },
            { questionIndex: 1, roundIndex: 1, attempt: PENALTY_ATTEMPT, accepted: false, points: -100 },
          ],
        },
      ],
    });
    expect((await careerFacts(db, me)).roundTypes).toBe(1);
  });

  it('a game whose award was lost is awarded on the next read with its own date; read again, nothing is loaded', async () => {
    const me = 'store-lost';
    await addUser(me, 'Мирослава');
    await read(me);
    // Мітка — ніби історію доповнено раніше, ніж закінчилась гра, чиє нагородження загубилось.
    await db.update(profile).set({ achievementsSyncedAt: new Date('2026-09-20T00:00:00Z') }).where(eq(profile.userId, me));
    const { gameId } = await playGame(me, new Date('2026-09-20T18:00:00Z'), { timeMs: 1500 });

    vi.mocked(games.loadAchievementGames).mockClear();
    const { earned, fresh } = await read(me);
    expect(fresh).toEqual(expect.arrayContaining(['first_game', 'fast_answer']));
    expect(earned.get('fast_answer')?.earnedAt?.toISOString()).toBe('2026-09-20T18:30:00.000Z');
    expect(earned.get('fast_answer')?.gameId).toBe(gameId);
    expect(earned.get('first_game')?.earnedAt?.toISOString()).toBe('2026-09-20T18:30:00.000Z');
    expect(earned.get('first_game')?.gameId).toBe(gameId);
    expect(games.loadAchievementGames).toHaveBeenCalledTimes(1);

    vi.mocked(games.loadAchievementGames).mockClear();
    expect((await read(me)).fresh).toEqual([]);
    expect(games.loadAchievementGames).not.toHaveBeenCalled();

    // Гру, яку нагородили як слід, наступне читання не перевіряє.
    const awardedGame = await playGame(me, new Date('2026-09-21T18:00:00Z'), { value: 50 });
    await awardGame(db, awardedGame.gameId);
    vi.mocked(games.loadAchievementGames).mockClear();
    expect((await read(me)).fresh).toEqual([]);
    expect(games.loadAchievementGames).not.toHaveBeenCalled();
  });

  it('a lost game that gave nothing is checked once: the mark moves past it', async () => {
    const me = 'store-nothing';
    await addUser(me, 'Богдана');
    await playGame(me, new Date('2026-09-22T18:00:00Z'));
    await read(me);
    await db.update(profile).set({ achievementsSyncedAt: new Date('2026-09-23T00:00:00Z') }).where(eq(profile.userId, me));
    await playGame(me, new Date('2026-09-23T18:00:00Z'));

    vi.mocked(games.loadAchievementGames).mockClear();
    await read(me);
    expect(games.loadAchievementGames).toHaveBeenCalledTimes(1);
    const [mark] = await db.select().from(profile).where(eq(profile.userId, me));
    expect(mark.achievementsSyncedAt?.toISOString()).toBe('2026-09-23T18:30:00.000Z');
    vi.mocked(games.loadAchievementGames).mockClear();
    await read(me);
    expect(games.loadAchievementGames).not.toHaveBeenCalled();
  });
});

describe('catch-up of lost awards beyond players (12i)', () => {
  /** Доповнена історія з міткою since: усе, що закінчилось пізніше, — для наздоганяння. */
  const syncedSince = async (userId: string, since: string) => {
    await read(userId);
    await db.update(profile).set({ achievementsSyncedAt: new Date(since) }).where(eq(profile.userId, userId));
  };

  it('a host whose award was lost gets «За пультом» with the game date on the next read', async () => {
    const host = 'store-lost-host';
    await addUser(host, 'Ведучий');
    await syncedSince(host, '2026-09-24T00:00:00Z');
    const hosted = await seedGame(db, {
      hostId: host,
      startedAt: new Date('2026-09-24T18:00:00Z'),
      finishedAt: new Date('2026-09-24T18:30:00Z'),
      players: [guest],
    });
    const { earned } = await read(host);
    expect(earned.get('host')?.earnedAt?.toISOString()).toBe('2026-09-24T18:30:00.000Z');
    expect(earned.get('host')?.gameId).toBe(hosted.gameId);
  });

  it('a quiz owner whose award was lost gets author_hit with the tenth game date on the next read', async () => {
    const author = 'store-lost-author';
    const player = 'store-lost-reader';
    await addUser(author, 'Авторка');
    await addUser(player, 'Ярема');
    const [own] = await db.insert(quiz).values({ ownerId: author, title: 'Полтава', description: '', settings: quizOne.settings, rounds: quizOne.rounds }).returning();
    for (let i = 0; i < 9; i++) await playGame(player, new Date(`2026-07-${10 + i}T18:00:00Z`), { quizId: own.id });
    await syncedSince(author, '2026-07-25T00:00:00Z');
    const tenth = await playGame(player, new Date('2026-07-25T18:00:00Z'), { quizId: own.id });
    const { earned } = await read(author);
    expect(earned.get('author_hit')?.earnedAt?.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    expect(earned.get('author_hit')?.gameId).toBe(tenth.gameId);
  });

  it('a missed game that cannot be checked does not break the read: it is reported and the mark moves past it', async () => {
    const me = 'store-lost-broken';
    await addUser(me, 'Орест');
    await syncedSince(me, '2026-09-25T00:00:00Z');
    await playGame(me, new Date('2026-09-25T18:00:00Z'));
    vi.mocked(games.loadAchievementGames).mockRejectedValueOnce(new Error('snapshot unreadable'));
    const errors: unknown[] = [];
    const { earned } = await syncAchievements(db, me, null, { onError: (error) => errors.push(error) });
    expect(errors).toHaveLength(1);
    // Кар'єрні все одно рахуються з фактів.
    expect(earned.has('first_game')).toBe(true);
    const [mark] = await db.select().from(profile).where(eq(profile.userId, me));
    expect(mark.achievementsSyncedAt?.toISOString()).toBe('2026-09-25T18:30:00.000Z');

    // Сторінка ачівок теж не падає, коли перевірка пропущеної гри ламається.
    await db.update(profile).set({ achievementsSyncedAt: new Date('2026-09-25T00:00:00Z') }).where(eq(profile.userId, me));
    await db.delete(userAchievement).where(eq(userAchievement.userId, me));
    vi.mocked(games.loadAchievementGames).mockRejectedValueOnce(new Error('snapshot unreadable'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const page = await achievementsPage(db, me, true);
      expect(page?.items.find((i) => i.id === 'first_game')?.earned).toBe(true);
      expect(quiet).toHaveBeenCalled();
    } finally {
      quiet.mockRestore();
    }
  });
});
