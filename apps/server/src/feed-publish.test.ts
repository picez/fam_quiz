import { randomUUID } from 'node:crypto';
import { makeQuiz, single } from '@quiz/engine/testing';
import { xpForLevel, type GameStatus, type PrizeContent } from '@quiz/shared';
import { and, eq, like, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { feedEvent, prizeAward, profile, quiz, user, userAchievement, xpEntry } from './db/schema';
import { announceLevels, backfillFeed, publishGameFeed, writeAchievementEvents, writeGameEvents, writePrizeEvents } from './feed-publish';
import { seedGame, type SeedPlayer } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const DAY = 86_400_000;

let db: Db;
let quizId: string;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  const sample = makeQuiz([single]);
  await db.insert(user).values({ id: 'h', name: 'Ведучий', email: 'h@example.com' });
  const [row] = await db.insert(quiz).values({ ownerId: 'h', title: 'Писанки', description: '', settings: sample.settings, rounds: sample.rounds }).returning();
  quizId = row.id;
});

/** Свіжі Оля й Петро для одного тесту (акаунти й профілі з feed_level null). */
async function people() {
  n += 1;
  const o = `o${n}`;
  const p = `p${n}`;
  for (const id of [o, p]) {
    await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
    await db.insert(profile).values({ userId: id, nickname: `Нік ${id}`, nicknameKey: `нік${id}` });
  }
  return { o, p };
}

async function game(players: SeedPlayer[], opts: { status?: GameStatus; finishedAt?: Date } = {}) {
  const finishedAt = opts.finishedAt ?? new Date('2026-10-30T12:00:00.123Z');
  const status = opts.status ?? 'finished';
  const { gameId, participantIds } = await seedGame(db, {
    hostId: 'h',
    quizId,
    title: 'Писанки',
    status,
    startedAt: new Date(finishedAt.getTime() - 30 * 60_000),
    finishedAt: status === 'finished' ? finishedAt : null,
    players,
  });
  return { gameId, participantIds, finishedAt };
}

const solo = (userId: string | null, rank: number | null, nickname = `Нік ${userId ?? 'гість'}`): SeedPlayer => ({ userId, nickname, score: 10, rank });

const eventsOf = (gameId: string) => db.select().from(feedEvent).where(eq(feedEvent.gameId, gameId));
const eventsBy = (userId: string) => db.select().from(feedEvent).where(eq(feedEvent.userId, userId));

async function giveXp(userId: string, amount: number) {
  await db.insert(xpEntry).values({ userId, source: 'game', gameId: randomUUID(), amount, day: '2026-10-30', at: new Date(), createdAt: new Date() });
}

const PRIZE: PrizeContent = { name: 'Кубок', trophy: null, engraving: null, real: { text: 'Справжній торт', photoUrl: null }, title: 'Знавець', diploma: false };

describe('writeGameEvents', () => {
  it('one row per account of the table, guests and the host without a place get none', async () => {
    const { o, p } = await people();
    const g = await game([solo(o, 1), solo(p, 2), solo(null, 3)]);
    await writeGameEvents(db, { gameId: g.gameId }, false);
    const rows = await eventsOf(g.gameId);
    expect(rows).toHaveLength(2);
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    expect(byUser.get(o)?.data).toEqual({ kind: 'game', title: 'Писанки', place: 1, of: 3, team: null });
    expect(byUser.get(p)?.data).toEqual({ kind: 'game', title: 'Писанки', place: 2, of: 3, team: null });
    expect(byUser.get(o)?.key).toBe(`game:${g.gameId}:${o}`);
    expect(byUser.get(o)?.kind).toBe('game');
    expect(byUser.get(o)?.at.toISOString()).toBe(g.finishedAt.toISOString());
    expect(byUser.has('h')).toBe(false);
  });

  it('the same account on two places gets one row with its best place (Review Focus 4)', async () => {
    const { o, p } = await people();
    const g = await game([solo(p, 1), solo(o, 2, 'Оля 1'), solo(null, 3), solo(o, 4, 'Оля 2')]);
    await writeGameEvents(db, { gameId: g.gameId }, false);
    const mine = (await eventsOf(g.gameId)).filter((r) => r.userId === o);
    expect(mine).toHaveLength(1);
    expect(mine[0].data).toMatchObject({ place: 2, of: 4 });
  });

  it('a team game names the team and counts the teams', async () => {
    const { o, p } = await people();
    const g = await game([
      { userId: null, nickname: 'Соняшники', score: 30, rank: 1, isTeam: true },
      { userId: null, nickname: 'Маки', score: 20, rank: 2, isTeam: true },
      { userId: o, nickname: 'Оля', score: 30, rank: 1, teamOf: 0 },
      { userId: p, nickname: 'Петро', score: 20, rank: 2, teamOf: 1 },
      { userId: null, nickname: 'Гість', score: 20, rank: 2, teamOf: 1 },
    ]);
    await writeGameEvents(db, { gameId: g.gameId }, false);
    const byUser = new Map((await eventsOf(g.gameId)).map((r) => [r.userId, r.data]));
    expect(byUser.get(o)).toEqual({ kind: 'game', title: 'Писанки', place: 1, of: 2, team: 'Соняшники' });
    expect(byUser.get(p)).toEqual({ kind: 'game', title: 'Писанки', place: 2, of: 2, team: 'Маки' });
  });

  it.each(['running', 'aborted', 'saved'] as const)('a %s game gives nothing', async (status) => {
    const { o, p } = await people();
    const g = await game([solo(o, 1), solo(p, 2)], { status });
    await writeGameEvents(db, { gameId: g.gameId }, false);
    await writeAchievementEvents(db, { gameId: g.gameId }, false);
    await writePrizeEvents(db, { gameId: g.gameId }, false);
    await publishGameFeed(db, g.gameId);
    expect(await eventsOf(g.gameId)).toEqual([]);
  });

  it('created_at is the write time for a live game and at for history', async () => {
    const { o, p } = await people();
    const g = await game([solo(o, 1)], { finishedAt: new Date(Date.now() - 5 * DAY) });
    const before = Date.now();
    await writeGameEvents(db, { gameId: g.gameId }, false);
    const [live] = await eventsOf(g.gameId);
    expect(live.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1);
    const h = await game([solo(p, 1)], { finishedAt: new Date(Date.now() - 5 * DAY) });
    await writeGameEvents(db, { since: new Date(Date.now() - 6 * DAY) }, true);
    const [old] = await eventsOf(h.gameId);
    expect(old.createdAt.toISOString()).toBe(old.at.toISOString());
    // Подію живої гри історія не переписує.
    const [again] = await eventsOf(g.gameId);
    expect(again.createdAt.getTime()).toBe(live.createdAt.getTime());
  });
});

describe('millisecond times', () => {
  it('microseconds from SQL are cut to milliseconds, so cursors compare exactly', async () => {
    const { o } = await people();
    const g = await game([solo(o, 1)]);
    await db.execute(sql`update game set finished_at = finished_at + interval '456 microseconds' where id = ${g.gameId}::uuid`);
    await writeGameEvents(db, { since: new Date(g.finishedAt.getTime() - 1000) }, true);
    const [row] = await eventsOf(g.gameId);
    // Порівняння в SQL: мікросекунди лишились би — рівності з мілісекундним Date не було б.
    const exact = await db.select().from(feedEvent).where(and(eq(feedEvent.gameId, g.gameId), eq(feedEvent.at, g.finishedAt), sql`${feedEvent.createdAt} = ${feedEvent.at}`));
    expect(row.at.toISOString()).toBe(g.finishedAt.toISOString());
    expect(exact).toHaveLength(1);
  });
});

describe('writeAchievementEvents', () => {
  it('dated achievements of the game only, unknown ids skipped', async () => {
    const { o, p } = await people();
    const g = await game([solo(o, 1), solo(p, 2)]);
    const other = await game([solo(o, 1)]);
    const earnedAt = new Date('2026-10-30T12:00:01.456Z');
    await db.insert(userAchievement).values([
      { userId: o, achievementId: 'first_win', earnedAt, gameId: g.gameId },
      { userId: o, achievementId: 'first_game', earnedAt: null, gameId: g.gameId },
      { userId: p, achievementId: 'first_game', earnedAt, gameId: other.gameId },
      { userId: p, achievementId: 'no_such_achievement' as never, earnedAt, gameId: g.gameId },
    ]);
    await writeAchievementEvents(db, { gameId: g.gameId }, false);
    const rows = await eventsOf(g.gameId);
    expect(rows.map((r) => r.key)).toEqual([`achievement:${o}:first_win`]);
    expect(rows[0].data).toEqual({ kind: 'achievement', achievementId: 'first_win' });
    expect(rows[0].at.toISOString()).toBe(earnedAt.toISOString());
    expect(rows[0].userId).toBe(o);
  });
});

describe('writePrizeEvents', () => {
  it('a prize with its title and no real prize details', async () => {
    const { o } = await people();
    const g = await game([solo(o, 1)]);
    const awardedAt = new Date('2026-10-30T12:00:02.789Z');
    const [award] = await db
      .insert(prizeAward)
      .values({ userId: o, prizeId: randomUUID(), gameId: g.gameId, place: 1, content: PRIZE, quizTitle: 'Писанки', nickname: 'Оля', awardedAt })
      .returning();
    await writePrizeEvents(db, { gameId: g.gameId }, false);
    const rows = await eventsOf(g.gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(`prize:${award.id}`);
    expect(rows[0].data).toEqual({ kind: 'prize', place: 1, name: 'Кубок', title: 'Писанки', nickTitle: 'Знавець' });
    expect(rows[0].at.toISOString()).toBe(awardedAt.toISOString());
  });

  it('a prize without a title has nickTitle null', async () => {
    const { o } = await people();
    const g = await game([solo(o, 1)]);
    await db.insert(prizeAward).values({ userId: o, prizeId: randomUUID(), gameId: g.gameId, place: 2, content: { ...PRIZE, title: null }, quizTitle: 'Писанки', nickname: 'Оля', awardedAt: new Date() });
    await writePrizeEvents(db, { gameId: g.gameId }, false);
    const [row] = await eventsOf(g.gameId);
    expect(row.data).toMatchObject({ kind: 'prize', place: 2, nickTitle: null });
  });
});

describe('announceLevels', () => {
  const levelRows = (userId: string) => db.select().from(feedEvent).where(and(eq(feedEvent.userId, userId), eq(feedEvent.kind, 'level')));
  const feedLevel = async (userId: string) => (await db.select({ l: profile.feedLevel }).from(profile).where(eq(profile.userId, userId)))[0].l;

  it('announces the new level once and remembers it', async () => {
    const { o } = await people();
    await giveXp(o, xpForLevel(3));
    const gameId = randomUUID();
    const at = new Date('2026-10-30T12:00:00.123Z');
    await announceLevels(db, [o], gameId, at);
    const rows = await levelRows(o);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(`level:${o}:3`);
    expect(rows[0].data).toEqual({ kind: 'level', level: 3 });
    expect(rows[0].gameId).toBe(gameId);
    expect(rows[0].at.toISOString()).toBe(at.toISOString());
    expect(await feedLevel(o)).toBe(3);
    await announceLevels(db, [o], gameId, at);
    expect(await levelRows(o)).toHaveLength(1);
  });

  it('level 1 announces nothing', async () => {
    const { o } = await people();
    await giveXp(o, xpForLevel(2) - 10);
    await announceLevels(db, [o], randomUUID(), new Date());
    expect(await levelRows(o)).toEqual([]);
  });

  it('a jump over several levels announces only the highest', async () => {
    const { o } = await people();
    await db.update(profile).set({ feedLevel: 3 }).where(eq(profile.userId, o));
    await giveXp(o, xpForLevel(5));
    await announceLevels(db, [o], randomUUID(), new Date());
    expect((await levelRows(o)).map((r) => r.key)).toEqual([`level:${o}:5`]);
    expect(await feedLevel(o)).toBe(5);
  });

  it('a level not above the announced one gives nothing', async () => {
    const { o } = await people();
    await db.update(profile).set({ feedLevel: 5 }).where(eq(profile.userId, o));
    await giveXp(o, xpForLevel(4));
    await announceLevels(db, [o], randomUUID(), new Date());
    expect(await levelRows(o)).toEqual([]);
    expect(await feedLevel(o)).toBe(5);
  });
});

describe('publishGameFeed', () => {
  it('writes game, achievement, prize and level events, and twice changes nothing', async () => {
    const { o, p } = await people();
    const g = await game([solo(o, 1), solo(p, 2)]);
    await db.insert(userAchievement).values({ userId: o, achievementId: 'first_win', earnedAt: g.finishedAt, gameId: g.gameId });
    await db.insert(prizeAward).values({ userId: o, prizeId: randomUUID(), gameId: g.gameId, place: 1, content: PRIZE, quizTitle: 'Писанки', nickname: 'Оля', awardedAt: g.finishedAt });
    await giveXp(o, xpForLevel(2));
    await publishGameFeed(db, g.gameId);
    const rows = await eventsOf(g.gameId);
    expect(rows.map((r) => r.kind).sort()).toEqual(['achievement', 'game', 'game', 'level', 'prize']);
    const level = rows.find((r) => r.kind === 'level');
    expect(level?.at.toISOString()).toBe(g.finishedAt.toISOString());
    await publishGameFeed(db, g.gameId);
    expect(await eventsOf(g.gameId)).toHaveLength(5);
  });

  it('the host and the author are level candidates too', async () => {
    const { o, p } = await people();
    const [row] = await db.insert(quiz).values({ ownerId: p, title: 'Мова', description: '', settings: makeQuiz([single]).settings, rounds: makeQuiz([single]).rounds }).returning();
    const { gameId } = await seedGame(db, { hostId: o, quizId: row.id, title: 'Мова', startedAt: new Date(), finishedAt: new Date(), players: [solo(null, 1)] });
    await giveXp(o, xpForLevel(2));
    await giveXp(p, xpForLevel(3));
    await publishGameFeed(db, gameId);
    expect((await eventsOf(gameId)).map((r) => r.key).sort()).toEqual([`level:${o}:2`, `level:${p}:3`].sort());
  });
});

describe('backfillFeed', () => {
  it('fills 90 days without lighting the badge and quietly sets feed_level', async () => {
    const fresh = await createTestDb();
    const now = new Date('2026-11-02T10:00:00.000Z');
    const prev = db;
    db = fresh;
    try {
      await db.insert(user).values({ id: 'h', name: 'Ведучий', email: 'h@example.com' });
      const { o, p } = await people();
      const old = await game([solo(o, 1), solo(p, 2)], { finishedAt: new Date(now.getTime() - 100 * DAY) });
      const recent = await game([solo(o, 2), solo(p, 1)], { finishedAt: new Date(now.getTime() - 10 * DAY) });
      await db.insert(userAchievement).values({ userId: p, achievementId: 'first_win', earnedAt: recent.finishedAt, gameId: recent.gameId });
      await db.insert(prizeAward).values({ userId: p, prizeId: randomUUID(), gameId: recent.gameId, place: 1, content: PRIZE, quizTitle: 'Писанки', nickname: 'Петро', awardedAt: recent.finishedAt });
      await giveXp(o, xpForLevel(4));

      await backfillFeed(db, now);
      expect(await eventsOf(old.gameId)).toEqual([]);
      const rows = await eventsOf(recent.gameId);
      expect(rows.map((r) => r.kind).sort()).toEqual(['achievement', 'game', 'game', 'prize']);
      for (const r of rows) expect(r.createdAt.toISOString()).toBe(r.at.toISOString());
      expect(await db.select().from(feedEvent).where(like(feedEvent.key, 'level:%'))).toEqual([]);
      const levels = new Map((await db.select({ id: profile.userId, l: profile.feedLevel }).from(profile)).map((r) => [r.id, r.l]));
      expect(levels.get(o)).toBe(4);
      expect(levels.get(p)).toBe(1);

      const total = (await db.select().from(feedEvent)).length;
      await backfillFeed(db, now);
      expect(await db.select().from(feedEvent)).toHaveLength(total);
      // Рівень, уже записаний, після тихого feed_level не оголошується.
      await publishGameFeed(db, recent.gameId);
      expect(await db.select().from(feedEvent).where(like(feedEvent.key, 'level:%'))).toEqual([]);
    } finally {
      db = prev;
    }
  });

  it('backfills more games than one batch', async () => {
    const fresh = await createTestDb();
    const prev = db;
    db = fresh;
    try {
      await db.insert(user).values({ id: 'h', name: 'Ведучий', email: 'h@example.com' });
      const { o } = await people();
      const now = new Date();
      for (let i = 0; i < 230; i++) await game([solo(o, 1)], { finishedAt: new Date(now.getTime() - DAY - i * 60_000) });
      await backfillFeed(db, now);
      expect(await eventsBy(o)).toHaveLength(230);
    } finally {
      db = prev;
    }
  });
});
