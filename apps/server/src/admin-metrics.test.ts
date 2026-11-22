import { randomUUID } from 'node:crypto';
import { blitzRound, bool, boardRound, classicRound, makeQuiz, makeRoundsQuiz, single, text, withId } from '@quiz/engine/testing';
import { BOT_USER_ID, quizSchema } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { shiftDay } from './admin-charts';
import { adminMetrics } from './admin-metrics';
import { ensureBotAccount } from './bot-account';
import type { Db } from './db/client';
import { activityDay, game, participant, profile, quiz, user } from './db/schema';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const now = new Date('2026-11-19T10:00:00Z');
const TODAY = '2026-11-19';
const MIN = 60_000;
const quizOne = makeQuiz([single]);

async function fresh(): Promise<Db> {
  const db = await createTestDb();
  await ensureBotAccount(db);
  return db;
}
async function person(db: Db, id: string, createdAt = new Date('2026-01-01T10:00:00Z')): Promise<string> {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com`, createdAt });
  await db.insert(profile).values({ userId: id, nickname: `Нік ${id}`, nicknameKey: `нік ${id}` });
  return id;
}
const players = (ids: (string | null)[]) => ids.map((userId, i) => ({ userId, nickname: userId ?? `гість ${i}`, score: 0, rank: null }));
/** Догра́на гра тривалістю minutes з людьми ids. */
const finishedGame = (db: Db, hostId: string, startedAt: string, minutes: number, ids: (string | null)[], extra: Partial<Parameters<typeof seedGame>[1]> = {}) =>
  seedGame(db, { hostId, startedAt: new Date(startedAt), finishedAt: new Date(Date.parse(startedAt) + minutes * MIN), players: players(ids), ...extra });
const bucketOf = (metrics: Awaited<ReturnType<typeof adminMetrics>>, start: string) => metrics.buckets.find((b) => b.start === start)!;

describe('adminMetrics (71)', () => {
  it('on an empty database gives 30 days of zeros, no shares, no previous period, empty lists', async () => {
    const db = await fresh();
    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.period).toBe(30);
    expect(metrics.bucket).toBe('day');
    expect(metrics.computedAt).toBe(now.toISOString());
    expect(metrics.buckets).toHaveLength(30);
    expect(metrics.buckets[0]!.start).toBe('2026-10-21');
    expect(metrics.buckets.at(-1)!.start).toBe(TODAY);
    for (const b of metrics.buckets) {
      expect(b).toEqual({
        start: b.start, days: 1, active: 0, players: 0, games: 0, finished: 0, aborted: 0, hosted: 0, autopilot: 0, bot: 0,
        completion: null, returns: null, avgPlayers: null, gameMin: 0, playerMin: 0, newUsers: 0, newQuizzes: 0, editorMin: 0,
      });
    }
    expect(metrics.summary).toMatchObject({ games: 0, completion: null, avgPlayers: null, medianGameMin: null, activation: null, dau: 0, wau: 0, mau: 0, stickiness: null, editorSessionMin: null, newUsers: 0 });
    expect(metrics.previous).toBeNull();
    expect(metrics.trackedSince).toBeNull();
    expect(metrics.topQuizzes).toEqual([]);
    expect(metrics.roundTypes).toEqual([]);
    expect(metrics.questionTypes).toEqual([]);
    expect(metrics.questionTypesGames).toBe(0);
    expect(metrics.topEditors).toEqual([]);
    expect(metrics.hours).toEqual(Array.from({ length: 24 }, () => 0));
  });

  it('counts accounts, games and finished games by the Kyiv day, and returns, as the old charts did', async () => {
    const db = await fresh();
    for (const id of ['ch1', 'ch2', 'ch3']) await db.insert(user).values({ id, name: id, email: `${id}@example.com`, createdAt: now });
    let code = 100000;
    async function play(startedAt: string, status: 'finished' | 'aborted', who: string[], guests = 0) {
      const id = randomUUID();
      await db.insert(game).values({ id, quizId: null, hostId: 'ch3', code: String((code += 1)), status, title: 't', quizSnapshot: quizOne, startedAt: new Date(startedAt) });
      for (const userId of who) await db.insert(participant).values({ id: randomUUID(), gameId: id, nickname: userId, userId, score: 0, totalTimeMs: 0 });
      for (let i = 0; i < guests; i += 1) await db.insert(participant).values({ id: randomUUID(), gameId: id, nickname: `g${i}`, userId: null, score: 0, totalTimeMs: 0 });
    }
    // 23:30 за Києвом 19.11 = 21:30 UTC 19.11 (взимку UTC+2)
    await play('2026-11-19T21:30:00Z', 'finished', ['ch1', 'ch2'], 1);
    await play('2026-11-19T08:00:00Z', 'aborted', ['ch1']);
    // тиждень тому: 8–14 днів тому для ch1, ch2
    await play('2026-11-08T10:00:00Z', 'finished', ['ch1', 'ch2']);
    const today = (await adminMetrics(db, 30, now)).buckets.at(-1)!;
    expect(today).toMatchObject({ start: TODAY, players: 2, games: 2, finished: 1, aborted: 1, completion: 50, returns: 100 });
    await play('2026-11-09T10:00:00Z', 'finished', ['ch3']);
    expect((await adminMetrics(db, 30, now)).buckets.at(-1)!.returns).toBe(67);
  });

  it('splits games by host: a person, an autopilot of a person, the bot', async () => {
    const db = await fresh();
    const olia = await person(db, 'olia');
    await finishedGame(db, olia, '2026-11-19T08:00:00Z', 20, [olia]);
    await finishedGame(db, olia, '2026-11-19T09:00:00Z', 20, [olia], { autopilot: true });
    await finishedGame(db, BOT_USER_ID, '2026-11-19T09:30:00Z', 20, [olia]);
    const metrics = await adminMetrics(db, 30, now);
    expect(bucketOf(metrics, TODAY)).toMatchObject({ games: 3, hosted: 1, autopilot: 1, bot: 1 });
    expect(metrics.summary).toMatchObject({ games: 3, hosted: 1, autopilot: 1, bot: 1 });
  });

  it('durations and players per finished game; a team row is not a person; a long game counts as 4 hours; an aborted game has no duration', async () => {
    const db = await fresh();
    const [a, b, c] = [await person(db, 'a'), await person(db, 'b'), await person(db, 'c')];
    await seedGame(db, {
      hostId: a,
      startedAt: new Date('2026-11-19T06:00:00Z'),
      finishedAt: new Date('2026-11-19T06:30:00Z'),
      players: [{ userId: null, nickname: 'Команда', score: 0, rank: null, isTeam: true }, ...players([a, b, null]).map((p) => ({ ...p, teamOf: 0 }))],
    });
    await finishedGame(db, a, '2026-11-19T07:00:00Z', 60, [c]);
    await finishedGame(db, a, '2026-11-18T07:00:00Z', 600, [a, b]);
    await seedGame(db, { hostId: a, status: 'aborted', startedAt: new Date('2026-11-19T08:00:00Z'), finishedAt: new Date('2026-11-19T12:00:00Z'), players: players([a]) });

    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.summary).toMatchObject({ games: 4, finished: 3, completion: 75, avgPlayers: 2, medianGameMin: 60, avgGameMin: 110, gameHours: 5.5, playerHours: 10.5 });
    expect(bucketOf(metrics, TODAY)).toMatchObject({ games: 3, finished: 2, aborted: 1, avgPlayers: 2, gameMin: 90, playerMin: 150 });
    expect(bucketOf(metrics, '2026-11-18')).toMatchObject({ games: 1, avgPlayers: 2, gameMin: 240, playerMin: 480 });
  });

  it('activity: active by day, average per day, 7 and 30 days, stickiness, tracked since; editor time and the top editors without e-mail', async () => {
    const db = await fresh();
    const [a, b, c] = [await person(db, 'a'), await person(db, 'b'), await person(db, 'c')];
    await db.insert(activityDay).values([
      { userId: a, day: TODAY, editorSec: 1800, editorSessions: 2 },
      { userId: a, day: '2026-11-18' },
      { userId: b, day: '2026-11-15', editorSec: 600, editorSessions: 1 },
      { userId: c, day: '2026-10-25' },
      // Поза періодом і поза запасом — лише для trackedSince.
      { userId: c, day: '2026-08-01' },
    ]);
    const metrics = await adminMetrics(db, 30, now);
    expect(bucketOf(metrics, TODAY)).toMatchObject({ active: 1, editorMin: 30 });
    expect(bucketOf(metrics, '2026-11-15')).toMatchObject({ active: 1, editorMin: 10 });
    expect(metrics.summary).toMatchObject({ dau: 0.1, wau: 2, mau: 3, stickiness: 4, editorHours: 0.7, editorSessions: 3, editorSessionMin: 13.3, editors: 2 });
    expect(metrics.trackedSince).toBe('2026-08-01');
    expect(metrics.topEditors).toEqual([
      { userId: a, nickname: 'Нік a', minutes: 30, sessions: 2 },
      { userId: b, nickname: 'Нік b', minutes: 10, sessions: 1 },
    ]);
    expect(JSON.stringify(metrics)).not.toContain('@');

    const week = await adminMetrics(db, 7, now);
    // mau тижневого періоду — за 30 днів до його кінця; залипання — середнє за ті самі 30 днів, не за 7.
    expect(week.summary).toMatchObject({ dau: 0.4, wau: 2, mau: 3, stickiness: 4 });
  });

  it('averages count only the days since tracking began; a previous period wholly before it has no activity numbers', async () => {
    const db = await fresh();
    const [a, b] = [await person(db, 'a'), await person(db, 'b')];
    // Облік почався 10.11: 10 днів до кінця 30-денного періоду; a — щодня, b — один день.
    const rows = Array.from({ length: 10 }, (_, i) => ({ userId: a, day: shiftDay('2026-11-10', i) }));
    await db.insert(activityDay).values([...rows, { userId: b, day: TODAY }]);
    // Гра в попередньому періоді (21.09–20.10) — він є, але цілком до початку обліку.
    await finishedGame(db, a, '2026-10-01T10:00:00Z', 10, [a]);

    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.trackedSince).toBe('2026-11-10');
    // 11 пар за 10 днів обліку, а не за 30.
    expect(metrics.summary).toMatchObject({ dau: 1.1, wau: 2, mau: 2, stickiness: 55 });
    expect(metrics.previous).toMatchObject({ games: 1, dau: null, wau: null, mau: null, stickiness: null });

    // Тиждень: 8 пар за 7 днів; попередній (6.11–12.11) — частково в обліку: 3 пари за 3 дні, а не за 7.
    const week = await adminMetrics(db, 7, now);
    expect(week.summary).toMatchObject({ dau: 1.1 });
    expect(week.previous).toMatchObject({ dau: 1 });
  });

  it('new accounts without the bot, and how many played within 7 days of signing up', async () => {
    const db = await fresh();
    const host = await person(db, 'host');
    const early = await person(db, 'early', new Date('2026-11-01T10:00:00Z'));
    const late = await person(db, 'late', new Date('2026-11-01T10:00:00Z'));
    await finishedGame(db, host, '2026-11-03T10:00:00Z', 10, [early]);
    await finishedGame(db, host, '2026-11-10T10:00:00Z', 10, [late]);
    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.summary).toMatchObject({ newUsers: 2, activation: 50 });
    expect(bucketOf(metrics, '2026-11-01').newUsers).toBe(2);

    // Акаунтам молодшим за 7 днів ще рано: у нових вони є, у частці активації — ні (ні в чисельнику, ні в знаменнику).
    const fresh1 = await person(db, 'fresh1', new Date('2026-11-15T10:00:00Z'));
    await person(db, 'fresh2', new Date('2026-11-19T08:00:00Z'));
    await finishedGame(db, host, '2026-11-16T10:00:00Z', 10, [fresh1]);
    const later = await adminMetrics(db, 30, now);
    expect(later.summary).toMatchObject({ newUsers: 4, activation: 50 });
  });

  it('new quizzes without the bot ones', async () => {
    const db = await fresh();
    const olia = await person(db, 'olia');
    const createdAt = new Date('2026-11-10T10:00:00Z');
    await db.insert(quiz).values([
      { ownerId: olia, title: 'Карпати', description: '', settings: quizOne.settings, rounds: quizOne.rounds, createdAt },
      { ownerId: BOT_USER_ID, title: 'Бот', description: '', settings: quizOne.settings, rounds: quizOne.rounds, createdAt },
    ]);
    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.summary.newQuizzes).toBe(1);
    expect(bucketOf(metrics, '2026-11-10').newQuizzes).toBe(1);
  });

  it('a year goes by 52 weeks ending today', async () => {
    const db = await fresh();
    const metrics = await adminMetrics(db, 365, now);
    expect(metrics.bucket).toBe('week');
    expect(metrics.buckets).toHaveLength(52);
    for (let i = 1; i < 52; i += 1) expect(metrics.buckets[i]!.start).toBe(shiftDay(metrics.buckets[i - 1]!.start, 7));
    expect(metrics.buckets.at(-1)!.start).toBe(shiftDay(TODAY, -6));
    expect(metrics.buckets.every((b) => b.days === 7)).toBe(true);
  });

  it('the previous equal period is summed when it has games', async () => {
    const db = await fresh();
    const olia = await person(db, 'olia');
    await finishedGame(db, olia, '2026-10-01T10:00:00Z', 10, [olia]);
    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.summary.games).toBe(0);
    expect(metrics.previous?.games).toBe(1);
  });

  it('top quizzes, round types, question types and start hours of the period', async () => {
    const db = await fresh();
    const olia = await person(db, 'olia');
    const snapshot = makeRoundsQuiz([
      classicRound('r1', [single, bool]),
      boardRound('r2', ['Гори', 'Ріки', 'Міста'].map((title, c) => ({ title, cells: [1, 2, 3].map((n) => withId(text, `b${c}${n}`)) }))),
    ]);
    expect(quizSchema.safeParse(snapshot).success).toBe(true);
    const [made] = await db.insert(quiz).values({ ownerId: olia, title: 'Карпати', description: '', settings: snapshot.settings, rounds: snapshot.rounds }).returning();
    const plays = [
      { roundIndex: 0, questionId: 'q1' },
      { roundIndex: 0, questionId: 'q3' },
      { roundIndex: 1, questionId: 'b01' },
      { roundIndex: 1, questionId: 'zz' },
    ];
    // 18:30 за Києвом = 16:30 UTC.
    await finishedGame(db, olia, '2026-11-18T16:30:00Z', 30, [olia, null], { quizId: made.id, snapshot, plays, title: 'Стара назва' });
    await finishedGame(db, olia, '2026-11-17T10:00:00Z', 50, [olia], { quizId: made.id, snapshot, plays: plays.slice(0, 1) });
    const blitz = makeRoundsQuiz([blitzRound('r1', [single])]);
    await finishedGame(db, olia, '2026-11-16T10:00:00Z', 10, [olia], { quizId: randomUUID(), snapshot: blitz, title: 'Видалена', plays: [{ roundIndex: 0, questionId: 'q1' }] });
    // Перервана гра — у топ і типи не йде, але година старту рахується.
    await seedGame(db, { hostId: olia, status: 'aborted', startedAt: new Date('2026-11-18T16:45:00Z'), players: players([olia]), snapshot, quizId: made.id });

    const metrics = await adminMetrics(db, 30, now);
    expect(metrics.topQuizzes[0]).toEqual({ id: made.id, title: 'Карпати', author: 'Нік olia', games: 2, avgPlayers: 1.5, avgMin: 40 });
    expect(metrics.topQuizzes[1]).toMatchObject({ title: 'Видалена', author: '', games: 1 });
    expect(metrics.roundTypes).toEqual([
      { type: 'board', games: 2 },
      { type: 'classic', games: 2 },
      { type: 'blitz', games: 1 },
    ]);
    expect(metrics.questionTypes).toEqual([
      { type: 'single', plays: 3 },
      { type: 'boolean', plays: 1 },
      { type: 'text', plays: 1 },
    ]);
    expect(metrics.questionTypesGames).toBe(3);
    expect(metrics.hours[18]).toBe(2);
    expect(metrics.hours[12]).toBe(2);
    expect(metrics.hours.reduce((sum, n) => sum + n, 0)).toBe(4);
  });
});
