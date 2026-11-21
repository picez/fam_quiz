import { BOT_USER_ID, levelOf } from '@quiz/shared';
import { makeQuiz, single } from '@quiz/engine/testing';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { mergeAccounts, previewMerge } from './account-merge';
import { buildApp } from './app';
import type { Db } from './db/client';
import {
  account,
  adminAction,
  familyGroup,
  feedEvent,
  follow,
  groupMember,
  liveRoom,
  mergedEmail,
  participant,
  profile,
  quiz,
  session,
  user,
  userAchievement,
  userBan,
  xpEntry,
} from './db/schema';
import { seedGame } from './testing/history-rows';
import { TEST_AUTH, cookieOf, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { referencing } from './testing/user-refs';
import { xpTotals } from './xp-store';

const ADMIN = 'am-admin';
const SECOND_ADMIN = 'am-second';
const NOW = new Date('2026-11-20T10:00:00.000Z');
const PAST = new Date('2026-11-01T10:00:00.000Z');
const ADMIN_EMAILS = new Set(['am-admin@example.com', 'am-second@example.com', 'am-third@example.com']);
const quizOne = makeQuiz([single]);

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values([
    { id: ADMIN, name: 'Адмін', email: 'am-admin@example.com', emailVerified: true },
    { id: SECOND_ADMIN, name: 'Другий адмін', email: 'am-second@example.com', emailVerified: true },
  ]);
  await db.insert(profile).values([
    { userId: ADMIN, nickname: 'Адмін', nicknameKey: 'адмінм' },
    { userId: SECOND_ADMIN, nickname: 'Другий адмін', nicknameKey: 'другийадмінм' },
  ]);
});

async function person(nickname: string, email?: string): Promise<string> {
  n += 1;
  const id = `am-${n}`;
  await db.insert(user).values({ id, name: nickname, email: email ?? `${id}@example.com`, emailVerified: email !== undefined });
  await db.insert(profile).values({ userId: id, nickname, nicknameKey: `${nickname.toLowerCase()}${n}м` });
  return id;
}

const input = (primaryId: string, secondaryId: string, adminId = ADMIN) => ({ adminId, primaryId, secondaryId, now: NOW, adminEmails: ADMIN_EMAILS });
const merge = (primaryId: string, secondaryId: string, adminId = ADMIN) => mergeAccounts(db, input(primaryId, secondaryId, adminId));
const preview = (primaryId: string, secondaryId: string, adminId = ADMIN) => previewMerge(db, input(primaryId, secondaryId, adminId));
const logOf = (userIds: string[]) => db.select().from(adminAction).where(inArray(adminAction.targetUserId, userIds));
const nonZero = (counts: Record<string, number>) => Object.entries(counts).filter(([, count]) => count > 0);

/** S з грою, вікториною, другом, групою, досягненням, досвідом і сесією; P з власним досвідом. */
async function pairWithHistory(): Promise<{ primary: string; secondary: string; olia: string }> {
  const primary = await person('Ольга');
  const secondary = await person('Оля');
  const olia = await person('Тарас');
  await seedGame(db, { hostId: olia, startedAt: PAST, players: [{ userId: secondary, nickname: 'Оля', score: 5, rank: 1 }] });
  await db.insert(quiz).values({ ownerId: secondary, title: 'Карпати', description: '', settings: quizOne.settings, rounds: quizOne.rounds });
  await db.insert(follow).values({ followerId: secondary, followeeId: olia });
  const [family] = await db.insert(familyGroup).values({ name: 'Родина', emoji: '👪', inviteCode: `code-${randomUUID()}` }).returning();
  await db.insert(groupMember).values([
    { groupId: family.id, userId: olia, role: 'owner', joinedAt: PAST },
    { groupId: family.id, userId: secondary, role: 'member', joinedAt: PAST },
  ]);
  await db.insert(userAchievement).values({ userId: secondary, achievementId: 'first_game', earnedAt: PAST });
  await db.insert(xpEntry).values([
    { userId: primary, source: 'admin', amount: 300, note: 'за допомогу', day: '2026-11-01', at: PAST, createdAt: PAST },
    { userId: secondary, source: 'admin', amount: 500, note: 'за допомогу', day: '2026-11-01', at: PAST, createdAt: PAST },
  ]);
  await db.insert(session).values({ id: `s-${secondary}`, token: `t-${secondary}`, userId: secondary, expiresAt: NOW });
  return { primary, secondary, olia };
}

describe('mergeAccounts', () => {
  it('merges two accounts in one go: rows move, the secondary is gone, the log line carries the summary', async () => {
    const { primary, secondary } = await pairWithHistory();

    const result = await merge(primary, secondary);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nonZero(await referencing(db, secondary))).toEqual([]);
    expect(await db.select().from(user).where(eq(user.id, secondary))).toEqual([]);
    const log = await logOf([primary, secondary]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'account_merge', adminId: ADMIN, targetUserId: primary, targetLabel: 'Ольга', details: { text: 'Оля' } });
    expect(log[0]!.details.merge).toEqual(result.summary);
    expect(result.summary).toMatchObject({ games: 1, quizzes: 1, friends: 1, groups: 1, achievements: 1, xp: 500 });
    expect(await db.select().from(adminAction).where(eq(adminAction.kind, 'account_delete'))).toEqual([]);
    const xp = (await xpTotals(db, [primary])).get(primary)!;
    expect(xp).toBe(800);
    expect(result.after).toEqual({ xp, level: levelOf(xp) });
    expect(await db.select().from(participant).where(eq(participant.userId, primary))).toHaveLength(1);
    expect(await db.select().from(mergedEmail).where(eq(mergedEmail.userId, primary))).toMatchObject([{ email: `${secondary}@example.com` }]);
    // Рівень з об'єднаного досвіду оголошено після фіксації.
    const [card] = await db.select({ feedLevel: profile.feedLevel }).from(profile).where(eq(profile.userId, primary));
    expect(card!.feedLevel).toBe(levelOf(xp));
    expect(await db.select().from(feedEvent).where(eq(feedEvent.key, `level:${primary}:${levelOf(xp)}`))).toHaveLength(1);
  });

  it('the committed hook (rooms in memory) runs after the commit and before the level announcement, and not on a refusal', async () => {
    const { primary, secondary } = await pairWithHistory();
    const seen: { secondaryRows: number; levelEvents: number }[] = [];
    const hook = async () => {
      seen.push({
        secondaryRows: (await db.select().from(user).where(eq(user.id, secondary))).length,
        levelEvents: (await db.select().from(feedEvent).where(and(eq(feedEvent.userId, primary), eq(feedEvent.kind, 'level')))).length,
      });
    };
    const result = await mergeAccounts(db, input(primary, secondary), hook);
    expect(result.ok).toBe(true);
    expect(seen).toEqual([{ secondaryRows: 0, levelEvents: 0 }]);
    expect(await db.select().from(feedEvent).where(and(eq(feedEvent.userId, primary), eq(feedEvent.kind, 'level')))).not.toHaveLength(0);

    let called = 0;
    expect(await mergeAccounts(db, input(primary, primary), () => {
      called += 1;
    })).toEqual({ ok: false, error: 'merge_same' });
    expect(called).toBe(0);
  });

  it('the preview equals the merge and changes nothing', async () => {
    const { primary, secondary } = await pairWithHistory();
    const before = { secondary: await referencing(db, secondary), primary: await referencing(db, primary) };

    const seen = await preview(primary, secondary);

    expect(seen).not.toBeNull();
    expect(seen!.refusal).toBeNull();
    expect(seen!.confirm).toBe('Оля');
    expect(seen!.primary).toMatchObject({ id: primary, nickname: 'Ольга', xp: 300, level: levelOf(300), logins: [] });
    expect(seen!.secondary).toMatchObject({ id: secondary, nickname: 'Оля', email: `${secondary}@example.com`, xp: 500, level: levelOf(500) });
    expect({ secondary: await referencing(db, secondary), primary: await referencing(db, primary) }).toEqual(before);
    expect(await logOf([primary, secondary])).toEqual([]);
    expect(await db.select().from(mergedEmail).where(eq(mergedEmail.userId, primary))).toEqual([]);

    const result = await merge(primary, secondary);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seen!.summary).toEqual(result.summary);
    expect(result.summary).toMatchObject({ games: 1, xp: 500 });
    expect(seen!.after).toEqual(result.after);
  });

  it("refuses an admin secondary, someone else's admin primary, a banned side and a live room in the database", async () => {
    const primary = await person('Ольга');
    const secondary = await person('Оля');
    const third = await person('Адмін три', 'am-third@example.com');
    expect(await merge(primary, third)).toEqual({ ok: false, error: 'merge_admin' });
    expect(await merge(SECOND_ADMIN, secondary)).toEqual({ ok: false, error: 'merge_admin' });
    expect(await merge(primary, primary)).toEqual({ ok: false, error: 'merge_same' });
    expect(await merge(primary, BOT_USER_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(await merge(primary, 'am-nobody')).toEqual({ ok: false, error: 'not_found' });
    expect(await preview(primary, BOT_USER_ID)).toBeNull();
    expect(await preview('am-nobody', secondary)).toBeNull();

    await db.insert(userBan).values({ userId: secondary, bannedBy: ADMIN, bannedAt: NOW });
    expect(await merge(primary, secondary)).toEqual({ ok: false, error: 'merge_banned' });
    expect(await merge(secondary, primary)).toEqual({ ok: false, error: 'merge_banned' });
    const banned = await preview(primary, secondary);
    expect(banned).toMatchObject({ refusal: 'merge_banned', summary: null, after: null, confirm: 'Оля' });
    await db.delete(userBan).where(eq(userBan.userId, secondary));

    const code = `am-${n}`;
    await db.insert(liveRoom).values({ code, roomId: randomUUID(), data: { hostUserId: ADMIN, playerUsers: [['p1', secondary]], state: { phase: 'question' } }, updatedAt: NOW });
    expect(await merge(primary, secondary)).toEqual({ ok: false, error: 'merge_live' });
    expect((await preview(primary, secondary))!.refusal).toBe('merge_live');
    // Кімната в пам'яті цього процесу (її перевіряє маршрут): рядок live_room ще не встиг записати кінець гри — не відмова.
    expect((await previewMerge(db, { ...input(primary, secondary, ADMIN), localRooms: new Set([code]) }))!.refusal).toBeNull();
    // Завершена кімната в базі — не жива гра.
    await db.update(liveRoom).set({ data: { hostUserId: ADMIN, playerUsers: [['p1', secondary]], state: { phase: 'finished' } } }).where(eq(liveRoom.code, code));
    expect((await preview(primary, secondary))!.refusal).toBeNull();
    await db.delete(liveRoom).where(eq(liveRoom.code, code));

    expect(nonZero(await referencing(db, secondary))).toContainEqual(['user', 1]);
    expect(await logOf([primary, secondary, third, SECOND_ADMIN])).toEqual([]);

    // Адмін, що діє, зливає свій другий акаунт у свій головний.
    const own = await person('Адмін-2');
    const done = await merge(ADMIN, own);
    expect(done.ok).toBe(true);
    expect(await db.select().from(user).where(eq(user.id, own))).toEqual([]);
  });

  it('a merged password lets the person sign in with the old address into the primary', async () => {
    const ctx = await buildApp({ db, auth: TEST_AUTH });
    try {
      const me = async (cookie: string) => ((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json() as { id: string }).id;
      const first = await signUp(ctx.app, 'Головна');
      const second = await signUp(ctx.app, 'Друга');
      const primary = await me(first.cookie);
      const secondary = await me(second.cookie);
      // Головний «з Google»: пароля в нього немає.
      await db.delete(account).where(and(eq(account.userId, primary), eq(account.providerId, 'credential')));
      await db.insert(account).values({ id: `g-${primary}`, accountId: 'g-p', providerId: 'google', userId: primary });

      const result = await merge(primary, secondary);
      expect(result).toMatchObject({ ok: true, summary: { logins: ['credential'], passwordDropped: false } });

      const signedIn = await ctx.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: second.email, password: second.password } });
      expect(signedIn.statusCode).toBe(200);
      expect(await me(cookieOf(signedIn))).toBe(primary);
    } finally {
      await ctx.app.close();
    }
  });

  it('a failure in the middle merges nothing', async () => {
    const { primary, secondary } = await pairWithHistory();
    const before = { secondary: await referencing(db, secondary), primary: await referencing(db, primary) };
    await db.execute(sql`create or replace function am_fail() returns trigger as $$ begin raise exception 'boom'; end $$ language plpgsql`);
    await db.execute(sql`create trigger am_fail before delete on "user" for each row when (old.id = ${sql.raw(`'${secondary}'`)}) execute function am_fail()`);
    try {
      await expect(merge(primary, secondary)).rejects.toThrow();
    } finally {
      await db.execute(sql`drop trigger am_fail on "user"`);
    }
    expect({ secondary: await referencing(db, secondary), primary: await referencing(db, primary) }).toEqual(before);
    expect(await db.select().from(session).where(eq(session.userId, secondary))).toHaveLength(1);
    expect(await db.select().from(mergedEmail).where(inArray(mergedEmail.userId, [primary, secondary]))).toEqual([]);
    expect(await logOf([primary, secondary])).toEqual([]);
    expect((await xpTotals(db, [primary])).get(primary)).toBe(300);
  });
});
