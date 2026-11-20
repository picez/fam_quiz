import { ACHIEVEMENT_XP, achievementRarity, levelOf } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { syncAchievements } from './achievement-store';
import type { Db } from './db/client';
import { achievementBlock, adminAction, feedEvent, profile, showcasePin, user, userAchievement, xpEntry } from './db/schema';
import { adjustXp, grantAchievement, revokeAchievement } from './player-card';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { creditGame, syncXp, xpTotals } from './xp-store';

const ADMIN = 'pc-admin';
const HOST = 'pc-host';
const NOW = new Date('2026-11-20T10:00:00.000Z');

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: ADMIN, name: 'Адмін 58', email: 'admin58@example.com' });
  await db.insert(profile).values({ userId: ADMIN, nickname: 'Адмін 58', nicknameKey: 'адмін58' });
  await db.insert(user).values({ id: HOST, name: 'Ведучий', email: 'pc-host@example.com' });
});

/** Новий гравець для одного тесту (Оля, Тарас, …) з профілем. */
async function person(name: 'Оля' | 'Тарас'): Promise<string> {
  n += 1;
  const id = `pc-${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname: `${name} ${n}`, nicknameKey: `${name.toLowerCase()}${n}` });
  return id;
}

/** Завершена гра, де me перший з correct правильними, і ще двоє нових акаунтів (досвід за правилами нараховується). */
async function win(me: string, correct: number, finishedAt: Date): Promise<string> {
  const others = [await person('Тарас'), await person('Тарас')];
  const players = [me, ...others].map((userId, i) => ({
    userId,
    nickname: `Нік ${i}`,
    score: 100 - i,
    rank: i + 1,
    rows: Array.from({ length: i === 0 ? correct : 0 }, (_, q) => ({ questionIndex: q, accepted: true, points: 10 })),
  }));
  const { gameId } = await seedGame(db, {
    hostId: HOST,
    startedAt: new Date(finishedAt.getTime() - 30 * 60_000),
    finishedAt,
    questionsPlayed: Math.max(5, correct),
    players,
  });
  return gameId;
}

const logOf = (userId: string) => db.select().from(adminAction).where(eq(adminAction.targetUserId, userId));
const achievementRows = (userId: string) => db.select().from(xpEntry).where(and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'achievement')));
const adminRows = (userId: string) => db.select().from(xpEntry).where(and(eq(xpEntry.userId, userId), eq(xpEntry.source, 'admin')));
const owned = (userId: string) => db.select().from(userAchievement).where(eq(userAchievement.userId, userId));
const blocks = (userId: string) => db.select().from(achievementBlock).where(eq(achievementBlock.userId, userId));
const total = async (userId: string) => (await xpTotals(db, [userId])).get(userId);
const levelEvents = (userId: string) => db.select().from(feedEvent).where(and(eq(feedEvent.userId, userId), eq(feedEvent.kind, 'level')));

describe('granting and revoking an achievement', () => {
  it('granting gives the achievement now, its xp and one log line', async () => {
    const olia = await person('Оля');
    expect(await grantAchievement(db, { adminId: ADMIN, userId: olia, achievementId: 'first_win', now: NOW })).toBe('granted');
    const [row] = await owned(olia);
    expect(row).toMatchObject({ achievementId: 'first_win', gameId: null });
    expect(row.earnedAt?.toISOString()).toBe(NOW.toISOString());
    const xp = await achievementRows(olia);
    expect(xp).toHaveLength(1);
    expect(xp[0]).toMatchObject({ achievementId: 'first_win', amount: ACHIEVEMENT_XP[achievementRarity('first_win')] });
    const log = await logOf(olia);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'achievement_grant', adminId: ADMIN, adminLabel: 'Адмін 58', details: { achievementId: 'first_win' } });

    expect(await grantAchievement(db, { adminId: ADMIN, userId: olia, achievementId: 'first_win', now: NOW })).toBe('owned');
    expect(await logOf(olia)).toHaveLength(1);
    expect(await owned(olia)).toHaveLength(1);
  });

  it('a granted achievement survives every sync', async () => {
    const olia = await person('Оля');
    await grantAchievement(db, { adminId: ADMIN, userId: olia, achievementId: 'first_win', now: NOW });
    await syncAchievements(db, olia, null);
    await db.update(profile).set({ xpSyncedAt: null }).where(eq(profile.userId, olia));
    await syncXp(db, olia);
    expect((await owned(olia)).map((r) => r.achievementId)).toEqual(['first_win']);
    const xp = await achievementRows(olia);
    expect(xp).toHaveLength(1);
    expect(xp[0].achievementId).toBe('first_win');
  });

  it('revoking takes the xp, the feed event and the pin, and blocks it', async () => {
    const olia = await person('Оля');
    // Оля справді виграла гру: доповнення історії видало б first_win знову, якби не заборона.
    await win(olia, 5, new Date('2026-11-01T10:00:00Z'));
    await syncAchievements(db, olia, null);
    await syncXp(db, olia);
    expect((await owned(olia)).some((r) => r.achievementId === 'first_win')).toBe(true);
    const key = `achievement:${olia}:first_win`;
    await db
      .insert(feedEvent)
      .values({ key, userId: olia, kind: 'achievement', gameId: null, data: { kind: 'achievement', achievementId: 'first_win' }, at: NOW, createdAt: NOW })
      .onConflictDoNothing({ target: feedEvent.key });
    await db.insert(showcasePin).values({ userId: olia, kind: 'achievement', itemId: 'first_win', slot: 0, pinnedAt: NOW });

    expect(await revokeAchievement(db, { adminId: ADMIN, userId: olia, achievementId: 'first_win', now: NOW })).toBe('revoked');
    expect((await owned(olia)).some((r) => r.achievementId === 'first_win')).toBe(false);
    expect((await achievementRows(olia)).some((r) => r.achievementId === 'first_win')).toBe(false);
    expect(await db.select().from(feedEvent).where(eq(feedEvent.key, key))).toEqual([]);
    expect(await db.select().from(showcasePin).where(eq(showcasePin.userId, olia))).toEqual([]);
    const blocked = await blocks(olia);
    expect(blocked.map((b) => b.achievementId)).toEqual(['first_win']);
    expect(blocked[0].blockedAt.toISOString()).toBe(NOW.toISOString());
    const log = await logOf(olia);
    expect(log.map((l) => [l.kind, l.details])).toEqual([['achievement_revoke', { achievementId: 'first_win' }]]);

    // Перший прохід без мітки й наздоганяння забраного не повертають.
    await db.update(profile).set({ achievementsSyncedAt: null }).where(eq(profile.userId, olia));
    await db.delete(userAchievement).where(eq(userAchievement.userId, olia));
    await syncAchievements(db, olia, null);
    await syncXp(db, olia);
    expect((await owned(olia)).some((r) => r.achievementId === 'first_win')).toBe(false);
    expect((await achievementRows(olia)).some((r) => r.achievementId === 'first_win')).toBe(false);

    expect(await grantAchievement(db, { adminId: ADMIN, userId: olia, achievementId: 'first_win', now: NOW })).toBe('granted');
    expect(await blocks(olia)).toEqual([]);
    expect((await owned(olia)).some((r) => r.achievementId === 'first_win')).toBe(true);
  });

  it('revoking an achievement the player does not have changes nothing', async () => {
    const olia = await person('Оля');
    expect(await revokeAchievement(db, { adminId: ADMIN, userId: olia, achievementId: 'first_win', now: NOW })).toBe('not_found');
    expect(await blocks(olia)).toEqual([]);
    expect(await logOf(olia)).toEqual([]);
  });
});

describe('manual xp', () => {
  const reason = 'Переможець вікторини в школі';

  it('manual xp is a journal row that counts in the level and not in the cap', async () => {
    const olia = await person('Оля');
    // Мітка вже є: гра нижче йде через стелю.
    await syncXp(db, olia);
    expect(await adjustXp(db, { adminId: ADMIN, userId: olia, amount: 300, reason, now: NOW })).toEqual({ ok: true, xp: 300, level: levelOf(300) });
    expect(levelOf(300)).toBe(2);
    const rows = await adminRows(olia);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 300, note: reason, counted: false, reason: null, gameId: null, achievementId: null, day: '2026-11-20' });
    expect(rows[0].at?.toISOString()).toBe(NOW.toISOString());
    const log = await logOf(olia);
    expect(log.map((l) => [l.kind, l.details])).toEqual([['xp_adjust', { amount: 300, reason }]]);

    // Та сама київська доба: 25 правильних першим — 50 + 250 + 100 = 400, повністю (не 300).
    const gameId = await win(olia, 25, new Date('2026-11-20T12:00:00Z'));
    await creditGame(db, gameId);
    const [row] = await db.select().from(xpEntry).where(and(eq(xpEntry.userId, olia), eq(xpEntry.gameId, gameId)));
    expect(row).toMatchObject({ amount: 400, reason: null });
  });

  it('manual xp survives the retro pass', async () => {
    const olia = await person('Оля');
    await syncXp(db, olia);
    await adjustXp(db, { adminId: ADMIN, userId: olia, amount: 300, reason, now: NOW });
    await win(olia, 5, new Date('2026-11-01T10:00:00Z'));
    await win(olia, 5, new Date('2026-11-02T10:00:00Z'));
    await db.update(profile).set({ xpSyncedAt: null }).where(eq(profile.userId, olia));
    await syncXp(db, olia);
    expect(await adminRows(olia)).toHaveLength(1);
    const all = await db.select().from(xpEntry).where(eq(xpEntry.userId, olia));
    const games = all.filter((r) => r.source === 'game');
    expect(games).toHaveLength(2);
    const rest = all.filter((r) => r.source !== 'admin').reduce((sum, r) => sum + r.amount, 0);
    expect(await total(olia)).toBe(rest + 300);
  });

  it('subtracting below zero is refused', async () => {
    const olia = await person('Оля');
    await adjustXp(db, { adminId: ADMIN, userId: olia, amount: 300, reason, now: NOW });
    expect(await adjustXp(db, { adminId: ADMIN, userId: olia, amount: -301, reason: 'Помилка', now: NOW })).toEqual({ ok: false, error: 'xp_below_zero' });
    expect(await adminRows(olia)).toHaveLength(1);
    expect(await logOf(olia)).toHaveLength(1);
    expect(await adjustXp(db, { adminId: ADMIN, userId: olia, amount: -300, reason: 'Помилка', now: NOW })).toEqual({ ok: true, xp: 0, level: 1 });
    expect(await total(olia)).toBe(0);
  });

  it('a raised level is announced once, a lowered one is not', async () => {
    const olia = await person('Оля');
    await adjustXp(db, { adminId: ADMIN, userId: olia, amount: 300, reason, now: NOW });
    const events = await levelEvents(olia);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: `level:${olia}:2`, gameId: null, data: { kind: 'level', level: 2 } });
    await adjustXp(db, { adminId: ADMIN, userId: olia, amount: -300, reason: 'Помилка', now: NOW });
    await adjustXp(db, { adminId: ADMIN, userId: olia, amount: 300, reason, now: NOW });
    expect(await levelEvents(olia)).toHaveLength(1);
  });
});

describe('unknown user', () => {
  it('all three give not_found and write no log', async () => {
    const userId = 'pc-nobody';
    expect(await grantAchievement(db, { adminId: ADMIN, userId, achievementId: 'first_win', now: NOW })).toBe('not_found');
    expect(await revokeAchievement(db, { adminId: ADMIN, userId, achievementId: 'first_win', now: NOW })).toBe('not_found');
    expect(await adjustXp(db, { adminId: ADMIN, userId, amount: 300, reason: 'Помилка', now: NOW })).toEqual({ ok: false, error: 'not_found' });
    expect(await logOf(userId)).toEqual([]);
    expect(await db.select().from(xpEntry).where(eq(xpEntry.userId, userId))).toEqual([]);
  });
});
