import { ACHIEVEMENTS } from '@quiz/shared';
import { classicRound, makeRoundsQuiz, single, slider } from '@quiz/engine/testing';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as games from './achievement-games';
import { achievementsPage, awardGame, careerFacts, syncAchievements } from './achievement-store';
import type { Db } from './db/client';
import { profile, quiz, user, userAchievement } from './db/schema';
import { setFollow } from './profiles';
import { seedGame, type SeedPlayer } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

vi.mock('./achievement-games', async (importOriginal) => {
  const original = await importOriginal<typeof import('./achievement-games')>();
  return { ...original, loadAchievementGames: vi.fn(original.loadAchievementGames) };
});

const HOST = 'store-host';

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  await addUser(HOST, 'Ведуча');
});

beforeEach(() => {
  vi.mocked(games.loadAchievementGames).mockClear();
});

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
const read = async (userId: string) => syncAchievements(db, userId, await careerFacts(db, userId), null);

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
