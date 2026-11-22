import { makeQuiz, single } from '@quiz/engine/testing';
import type { PrizeContent } from '@quiz/shared';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PEOPLE_RULES } from './account-merge-people';
import { applyMergeRules, mergeContext, type MergeContext } from './account-merge-rules';
import { buildApp } from './app';
import type { Db } from './db/client';
import {
  account,
  achievementBlock,
  activityDay,
  adminAction,
  announcement,
  botPlan,
  calendarEvent,
  calendarRequest,
  challenge,
  challengeAttempt,
  familyGroup,
  follow,
  game,
  groupInvite,
  groupItem,
  groupMember,
  inboxItem,
  libraryCopy,
  libraryEntry,
  mergedEmail,
  prize,
  prizeAward,
  problemReport,
  profile,
  pushBroadcast,
  pushSubscription,
  quiz,
  serverError,
  session,
  showcasePin,
  user,
  userAchievement,
  userBan,
  userReport,
  userTitle,
} from './db/schema';
import { TEST_AUTH, cookieOf } from './testing/accounts';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const NOW = new Date('2026-11-20T10:00:00.000Z');
const PAST = new Date('2026-11-01T10:00:00.000Z');
const EARLY = new Date('2026-10-01T10:00:00.000Z');
const LATER = new Date('2026-12-20T10:00:00.000Z');
const quizOne = makeQuiz([single]);
const CUP: PrizeContent = { name: 'Кубок', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false };

let db: Db;
let app: Awaited<ReturnType<typeof buildApp>>;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  app = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await app.app.close();
});

/** Акаунт з профілем (як у account-delete.test). */
async function person(name: string): Promise<string> {
  n += 1;
  const id = `mp-${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname: name, nicknameKey: `${name.toLowerCase()}${n}м` });
  return id;
}

async function ownQuiz(ownerId: string, title = 'Карпати'): Promise<string> {
  const [row] = await db.insert(quiz).values({ ownerId, title, description: '', settings: quizOne.settings, rounds: quizOne.rounds }).returning();
  return row.id;
}

async function group(members: { userId: string; role: 'owner' | 'member'; joinedAt: Date }[]): Promise<string> {
  const [row] = await db.insert(familyGroup).values({ name: 'Родина', emoji: '👪', inviteCode: `code-${randomUUID()}` }).returning();
  await db.insert(groupMember).values(members.map((m) => ({ groupId: row.id, ...m })));
  return row.id;
}

async function award(userId: string, place: 1 | 2 | 3 = 1, gameId: string = randomUUID()): Promise<string> {
  const [row] = await db
    .insert(prizeAward)
    .values({ userId, prizeId: randomUUID(), gameId, place, content: CUP, quizTitle: 'Гра', nickname: 'Гравець', awardedAt: NOW })
    .returning();
  return row.id;
}

async function pair(): Promise<{ primary: string; secondary: string; ctx: MergeContext }> {
  const primary = await person('Оля');
  const secondary = await person('Ольга');
  return { primary, secondary, ctx: mergeContext(primary, secondary, 'Оля') };
}

const merge = (ctx: MergeContext) => db.transaction((tx) => applyMergeRules(tx, ctx, PEOPLE_RULES));

const accountsOf = (userId: string) => db.select().from(account).where(eq(account.userId, userId));

describe('people rules', () => {
  it('a Google login moves to the primary and the password moves with account_id set to the primary', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(account).values([
      { id: `g-${secondary}`, accountId: 'g-1', providerId: 'google', userId: secondary },
      { id: `c-${secondary}`, accountId: secondary, providerId: 'credential', userId: secondary, password: 'hash-of-secondary' },
    ]);

    await merge(ctx);

    const rows = await accountsOf(primary);
    expect(rows.map((row) => [row.providerId, row.accountId, row.password]).sort()).toEqual([
      ['credential', primary, 'hash-of-secondary'],
      ['google', 'g-1', null],
    ]);
    expect(ctx.summary.logins).toEqual(['google', 'credential']);
    expect(ctx.summary.passwordDropped).toBe(false);
    expect(await accountsOf(secondary)).toEqual([]);
    const pairs = (await db.select({ providerId: account.providerId, accountId: account.accountId }).from(account)).map((row) => `${row.providerId}:${row.accountId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('when both have a password the primary keeps its own and the secondary one is dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(account).values([
      { id: `c-${primary}`, accountId: primary, providerId: 'credential', userId: primary, password: 'hash-of-primary' },
      { id: `c-${secondary}`, accountId: secondary, providerId: 'credential', userId: secondary, password: 'hash-of-secondary' },
    ]);

    await merge(ctx);

    const rows = await accountsOf(primary);
    expect(rows.map((row) => [row.providerId, row.accountId, row.password])).toEqual([['credential', primary, 'hash-of-primary']]);
    expect(ctx.summary.passwordDropped).toBe(true);
    expect(ctx.summary.logins).toEqual([]);
    expect(await accountsOf(secondary)).toEqual([]);
  });

  it('a Google login the primary already has is not duplicated', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(account).values([
      { id: `g-${primary}`, accountId: `same-${primary}`, providerId: 'google', userId: primary },
      { id: `g-${secondary}`, accountId: `same-${primary}`, providerId: 'google', userId: secondary },
      { id: `o-${secondary}`, accountId: `gh-${secondary}`, providerId: 'github', userId: secondary },
    ]);

    await merge(ctx);

    expect((await accountsOf(primary)).map((row) => row.id).sort()).toEqual([`g-${primary}`, `o-${secondary}`]);
    expect(ctx.summary.logins).toEqual(['other']);
  });

  it('the secondary password signs in to the primary through Better Auth when the primary had none', async () => {
    const primary = await person('Оля');
    const email = `ba-${n}-${Date.now()}@example.com`;
    const password = 'secondary long password';
    const made = await app.app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { name: 'Ольга', email, password } });
    expect(made.statusCode).toBe(200);
    const [secondaryRow] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    const secondary = secondaryRow.id;

    await merge(mergeContext(primary, secondary, 'Оля'));

    const signIn = (address: string) => app.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: address, password } });
    const signed = await signIn(`${primary}@example.com`);
    expect(signed.statusCode).toBe(200);
    const me = await app.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookieOf(signed) } });
    expect(me.json().id).toBe(primary);
    // Рядок S ще є (його видалить deleteAccount), але пароля в нього вже немає.
    expect((await signIn(email)).statusCode).toBe(401);
  });

  it('when both had a password only the primary one signs in through Better Auth', async () => {
    const signUp = async (name: string, password: string) => {
      const email = `ba2-${password.split(' ')[0]}-${++n}-${Date.now()}@example.com`;
      const made = await app.app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { name, email, password } });
      expect(made.statusCode).toBe(200);
      const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
      return { id: row.id, email, password };
    };
    const olya = await signUp('Оля', 'primary long password');
    const olga = await signUp('Ольга', 'secondary long password');

    await merge(mergeContext(olya.id, olga.id, 'Оля'));

    const signIn = (email: string, password: string) => app.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email, password } });
    const ok = await signIn(olya.email, olya.password);
    expect(ok.statusCode).toBe(200);
    expect((await app.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookieOf(ok) } })).json().id).toBe(olya.id);
    expect((await signIn(olya.email, olga.password)).statusCode).toBe(401);
  });

  it('the secondary sessions are closed and the primary ones stay', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(session).values([
      { id: `s-${primary}`, token: `t-${primary}`, userId: primary, expiresAt: LATER },
      { id: `s-${secondary}`, token: `t-${secondary}`, userId: secondary, expiresAt: LATER },
    ]);

    await merge(ctx);

    expect((await db.select().from(session).where(inArray(session.userId, [primary, secondary]))).map((row) => row.id)).toEqual([`s-${primary}`]);
  });

  it('friends merge into one row each way and their friendship with each other disappears', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    await db.insert(follow).values([
      { followerId: secondary, followeeId: petro },
      { followerId: primary, followeeId: petro },
      { followerId: petro, followeeId: secondary },
      { followerId: primary, followeeId: secondary },
    ]);

    await merge(ctx);

    const rows = await db.select().from(follow).where(or(inArray(follow.followerId, [primary, secondary, petro]), inArray(follow.followeeId, [primary, secondary, petro])));
    expect(rows.map((row) => `${row.followerId}>${row.followeeId}`).sort()).toEqual([`${petro}>${primary}`, `${primary}>${petro}`].sort());
    expect(ctx.summary.sameFriends).toBe(1);
    expect(ctx.summary.friends).toBe(1);
  });

  it('in a shared group the primary keeps one row with the earlier join and becomes owner when the secondary owned it', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const shared = await group([
      { userId: secondary, role: 'owner', joinedAt: EARLY },
      { userId: primary, role: 'member', joinedAt: PAST },
      { userId: petro, role: 'member', joinedAt: EARLY },
    ]);
    const onlySecondary = await group([
      { userId: petro, role: 'owner', joinedAt: EARLY },
      { userId: secondary, role: 'member', joinedAt: PAST },
    ]);

    await merge(ctx);

    const members = await db.select().from(groupMember).where(eq(groupMember.groupId, shared));
    expect(members.filter((row) => row.role === 'owner').map((row) => row.userId)).toEqual([primary]);
    expect(members.filter((row) => row.userId === primary).map((row) => row.joinedAt)).toEqual([EARLY]);
    expect(members.some((row) => row.userId === secondary)).toBe(false);
    const other = await db.select().from(groupMember).where(eq(groupMember.groupId, onlySecondary));
    expect(other.map((row) => [row.userId, row.role]).sort()).toEqual([[petro, 'owner'], [primary, 'member']].sort());
    expect(ctx.summary.sameGroups).toBe(1);
    expect(ctx.summary.groups).toBe(1);
  });

  it('an invite to a group the primary is already in is dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const joined = await group([
      { userId: petro, role: 'owner', joinedAt: EARLY },
      { userId: primary, role: 'member', joinedAt: PAST },
    ]);
    const invitedBoth = await group([{ userId: petro, role: 'owner', joinedAt: EARLY }]);
    const fresh = await group([{ userId: petro, role: 'owner', joinedAt: EARLY }]);
    const secondaryOwn = await group([{ userId: secondary, role: 'owner', joinedAt: EARLY }]);
    await db.insert(groupInvite).values([
      { groupId: joined, userId: secondary, invitedBy: petro, createdAt: NOW },
      { groupId: invitedBoth, userId: secondary, invitedBy: petro, createdAt: NOW },
      { groupId: invitedBoth, userId: primary, invitedBy: petro, createdAt: NOW },
      { groupId: fresh, userId: secondary, invitedBy: petro, createdAt: NOW },
      { groupId: secondaryOwn, userId: petro, invitedBy: secondary, createdAt: NOW },
    ]);

    await merge(ctx);

    const invites = await db.select().from(groupInvite).where(inArray(groupInvite.groupId, [joined, invitedBoth, fresh, secondaryOwn]));
    expect(invites.map((row) => `${row.groupId}:${row.userId}:${row.invitedBy}`).sort()).toEqual(
      [`${invitedBoth}:${primary}:${petro}`, `${fresh}:${primary}:${petro}`, `${secondaryOwn}:${petro}:${primary}`].sort(),
    );
  });

  it('an invite of the primary to a group it joins through the merge is dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const secondaryOwn = await group([{ userId: secondary, role: 'owner', joinedAt: EARLY }]);
    const secondaryIn = await group([
      { userId: petro, role: 'owner', joinedAt: EARLY },
      { userId: secondary, role: 'member', joinedAt: PAST },
    ]);
    await db.insert(groupInvite).values([
      { groupId: secondaryOwn, userId: primary, invitedBy: secondary, createdAt: NOW },
      { groupId: secondaryIn, userId: primary, invitedBy: petro, createdAt: NOW },
    ]);

    await merge(ctx);

    expect(await db.select().from(groupInvite).where(inArray(groupInvite.groupId, [secondaryOwn, secondaryIn]))).toEqual([]);
    const members = await db.select().from(groupMember).where(inArray(groupMember.groupId, [secondaryOwn, secondaryIn]));
    expect(members.filter((row) => row.userId === primary).map((row) => [row.groupId, row.role]).sort()).toEqual([[secondaryOwn, 'owner'], [secondaryIn, 'member']].sort());
  });

  it('group items written by the secondary keep their author as the primary', async () => {
    const { primary, secondary, ctx } = await pair();
    const groupId = await group([{ userId: secondary, role: 'owner', joinedAt: EARLY }]);
    const [item] = await db.insert(groupItem).values({ groupId, authorId: secondary, kind: 'fact', text: 'Любить гори', about: [] }).returning();

    await merge(ctx);

    expect((await db.select().from(groupItem).where(eq(groupItem.id, item.id)))[0]?.authorId).toBe(primary);
  });

  it('the title with the later expiry stays', async () => {
    const later = await pair();
    await db.insert(userTitle).values([
      { userId: later.primary, text: 'Старий', gameId: randomUUID(), awardedAt: PAST, expiresAt: NOW },
      { userId: later.secondary, text: 'Новий', gameId: randomUUID(), awardedAt: PAST, expiresAt: LATER },
    ]);
    const kept = await pair();
    await db.insert(userTitle).values([
      { userId: kept.primary, text: 'Свій', gameId: randomUUID(), awardedAt: PAST, expiresAt: LATER },
      { userId: kept.secondary, text: 'Чужий', gameId: randomUUID(), awardedAt: PAST, expiresAt: NOW },
    ]);
    const only = await pair();
    await db.insert(userTitle).values({ userId: only.secondary, text: 'Єдиний', gameId: randomUUID(), awardedAt: PAST, expiresAt: NOW });

    await merge(later.ctx);
    await merge(kept.ctx);
    await merge(only.ctx);

    const titleOf = async (userId: string) => (await db.select().from(userTitle).where(eq(userTitle.userId, userId))).map((row) => row.text);
    expect(await titleOf(later.primary)).toEqual(['Новий']);
    expect(await titleOf(kept.primary)).toEqual(['Свій']);
    expect(await titleOf(only.primary)).toEqual(['Єдиний']);
    for (const side of [later, kept, only]) expect(await titleOf(side.secondary)).toEqual([]);
  });

  it('a block is dropped when the merged account owns that achievement', async () => {
    const { primary, secondary, ctx } = await pair();
    // Досягнення P після кроку 2 (задача 4) — вручну.
    await db.insert(userAchievement).values({ userId: primary, achievementId: 'first_win', earnedAt: PAST });
    await db.insert(achievementBlock).values([
      { userId: secondary, achievementId: 'first_win', blockedAt: NOW },
      { userId: secondary, achievementId: 'first_game', blockedAt: NOW },
      { userId: secondary, achievementId: 'first_note', blockedAt: NOW },
      { userId: primary, achievementId: 'first_note', blockedAt: PAST },
    ]);

    await merge(ctx);

    const blocks = await db.select().from(achievementBlock).where(inArray(achievementBlock.userId, [primary, secondary]));
    expect(blocks.map((row) => `${row.userId}:${row.achievementId}`).sort()).toEqual([`${primary}:first_game`, `${primary}:first_note`]);
  });

  it('prizes and awards move and an award for the same game place stays the primary one', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(prize).values({ ownerId: secondary, content: CUP, createdAt: NOW, updatedAt: NOW });
    const gameId = randomUUID();
    const mine = await award(primary, 1, gameId);
    const theirsSame = await award(secondary, 1, gameId);
    const theirsOther = await award(secondary, 2);
    await db.insert(showcasePin).values({ userId: secondary, kind: 'prize', itemId: theirsSame, slot: 0, pinnedAt: NOW });

    await merge(ctx);

    expect((await db.select().from(prize).where(eq(prize.ownerId, primary))).length).toBe(1);
    const awards = await db.select().from(prizeAward).where(inArray(prizeAward.userId, [primary, secondary]));
    expect(awards.map((row) => `${row.userId}:${row.id}`).sort()).toEqual([`${primary}:${mine}`, `${primary}:${theirsOther}`].sort());
    expect(await db.select().from(showcasePin).where(eq(showcasePin.itemId, theirsSame))).toEqual([]);
    expect(ctx.summary.prizes).toBe(2);
  });

  it('secondary pins fill free slots up to the limit and duplicates are dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    const p1 = await award(primary);
    const p2 = await award(primary);
    const s1 = await award(secondary);
    const s2 = await award(secondary);
    await db.insert(userAchievement).values([
      { userId: primary, achievementId: 'first_game', earnedAt: PAST },
      { userId: primary, achievementId: 'first_win', earnedAt: PAST },
    ]);
    await db.insert(showcasePin).values([
      { userId: primary, kind: 'prize', itemId: p1, slot: 0, pinnedAt: PAST },
      { userId: primary, kind: 'prize', itemId: p2, slot: 2, pinnedAt: PAST },
      { userId: secondary, kind: 'prize', itemId: s2, slot: 0, pinnedAt: NOW },
      { userId: secondary, kind: 'prize', itemId: s1, slot: 1, pinnedAt: EARLY },
      { userId: primary, kind: 'achievement', itemId: 'first_game', slot: 0, pinnedAt: PAST },
      { userId: secondary, kind: 'achievement', itemId: 'first_game', slot: 0, pinnedAt: PAST },
      { userId: secondary, kind: 'achievement', itemId: 'first_win', slot: 1, pinnedAt: PAST },
      // Досягнення, яким P не володіє, — геть.
      { userId: secondary, kind: 'achievement', itemId: 'first_note', slot: 2, pinnedAt: PAST },
    ]);

    await merge(ctx);

    const pins = await db.select().from(showcasePin).where(inArray(showcasePin.userId, [primary, secondary]));
    const view = (kind: string) =>
      pins
        .filter((row) => row.kind === kind)
        .sort((a, b) => a.slot - b.slot)
        .map((row) => [row.userId, row.itemId, row.slot]);
    expect(view('prize')).toEqual([
      [primary, p1, 0],
      [primary, s1, 1],
      [primary, p2, 2],
    ]);
    expect(view('achievement')).toEqual([
      [primary, 'first_game', 0],
      [primary, 'first_win', 1],
    ]);
  });

  it('a calendar request for an event the primary now hosts is dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const [secondaryEvent] = await db.insert(calendarEvent).values({ hostId: secondary, title: 'Вечір', startsAt: NOW, createdAt: NOW }).returning();
    const [primaryEvent] = await db.insert(calendarEvent).values({ hostId: primary, title: 'Свій вечір', startsAt: NOW, createdAt: NOW }).returning();
    const [petroEvent] = await db.insert(calendarEvent).values({ hostId: petro, title: 'Петрів вечір', startsAt: NOW, createdAt: NOW }).returning();
    const [petroOther] = await db.insert(calendarEvent).values({ hostId: petro, title: 'Ще вечір', startsAt: NOW, createdAt: NOW }).returning();
    await db.insert(calendarRequest).values([
      { eventId: secondaryEvent.id, userId: primary, status: 'pending', requestedAt: NOW },
      { eventId: secondaryEvent.id, userId: petro, status: 'pending', requestedAt: NOW },
      { eventId: primaryEvent.id, userId: secondary, status: 'pending', requestedAt: NOW },
      { eventId: petroEvent.id, userId: secondary, status: 'pending', requestedAt: NOW },
      { eventId: petroEvent.id, userId: primary, status: 'approved', requestedAt: PAST },
      { eventId: petroOther.id, userId: secondary, status: 'pending', requestedAt: NOW },
    ]);

    await merge(ctx);

    expect((await db.select().from(calendarEvent).where(eq(calendarEvent.id, secondaryEvent.id)))[0]?.hostId).toBe(primary);
    const requests = await db.select().from(calendarRequest).where(inArray(calendarRequest.eventId, [secondaryEvent.id, primaryEvent.id, petroEvent.id, petroOther.id]));
    expect(requests.map((row) => `${row.eventId}:${row.userId}:${row.status}`).sort()).toEqual(
      [`${secondaryEvent.id}:${petro}:pending`, `${petroEvent.id}:${primary}:approved`, `${petroOther.id}:${primary}:pending`].sort(),
    );
    expect(ctx.summary.calendar).toBe(2);
  });

  it('the earlier challenge attempt stays', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const quizId = await ownQuiz(petro);
    const [early] = await db.insert(challenge).values({ code: `c1-${secondary}`, quizId, ownerId: petro, title: 'Виклик', quizSnapshot: quizOne, createdAt: NOW, expiresAt: LATER }).returning();
    const [late] = await db.insert(challenge).values({ code: `c2-${secondary}`, ownerId: petro, title: 'Другий', quizSnapshot: quizOne, createdAt: NOW, expiresAt: LATER }).returning();
    const [own] = await db.insert(challenge).values({ code: `c3-${secondary}`, ownerId: secondary, title: 'Свій', quizSnapshot: quizOne, createdAt: NOW, expiresAt: LATER }).returning();
    const secondaryEarly = randomUUID();
    const primaryEarly = randomUUID();
    await db.insert(challengeAttempt).values([
      { challengeId: early.id, userId: secondary, gameId: secondaryEarly, nickname: 'Ольга', startedAt: EARLY },
      { challengeId: early.id, userId: primary, gameId: randomUUID(), nickname: 'Оля', startedAt: PAST },
      { challengeId: late.id, userId: secondary, gameId: randomUUID(), nickname: 'Ольга', startedAt: NOW },
      { challengeId: late.id, userId: primary, gameId: primaryEarly, nickname: 'Оля', startedAt: PAST },
    ]);

    await merge(ctx);

    const attempts = await db.select().from(challengeAttempt).where(inArray(challengeAttempt.challengeId, [early.id, late.id]));
    expect(attempts.map((row) => `${row.challengeId}:${row.userId}:${row.gameId}`).sort()).toEqual([`${early.id}:${primary}:${secondaryEarly}`, `${late.id}:${primary}:${primaryEarly}`].sort());
    expect((await db.select().from(challenge).where(eq(challenge.id, own.id)))[0]?.ownerId).toBe(primary);
    expect(ctx.summary.challenges).toBe(2);
  });

  it('a report of the primary on itself is dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    await db.insert(userReport).values([
      { reporterId: primary, targetKind: 'profile', targetUserId: secondary, reason: 'spam' },
      { reporterId: secondary, targetKind: 'profile', targetUserId: primary, reason: 'spam' },
      { reporterId: secondary, targetKind: 'profile', targetUserId: petro, reason: 'spam' },
      { reporterId: primary, targetKind: 'profile', targetUserId: petro, reason: 'other' },
      { reporterId: petro, targetKind: 'profile', targetUserId: secondary, reason: 'spam' },
      { reporterId: petro, targetKind: 'profile', targetUserId: primary, reason: 'other' },
    ]);

    await merge(ctx);

    const reports = await db.select().from(userReport).where(or(inArray(userReport.reporterId, [primary, secondary]), inArray(userReport.targetUserId, [primary, secondary])));
    expect(reports.map((row) => `${row.reporterId}>${row.targetUserId}:${row.reason}`).sort()).toEqual([`${primary}>${petro}:other`, `${petro}>${primary}:other`].sort());
  });

  it('quizzes, hosted games, library, push devices, created plans and resolved errors move to the primary', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const quizId = await ownQuiz(secondary);
    await seedGame(db, { hostId: secondary, startedAt: PAST, players: [{ userId: petro, nickname: 'Петро', score: 1, rank: 1 }] });
    const [entry] = await db
      .insert(libraryEntry)
      .values({ quizId, ownerId: secondary, title: 'Карпати', description: '', language: 'uk', snapshot: quizOne, questionCount: 1, roundTypes: ['classic'], listed: true, openedAt: NOW, updatedAt: NOW })
      .returning();
    await db.insert(libraryCopy).values({ entryId: entry.id, userId: secondary, quizId, authorLine: 'Автор: Ольга', at: NOW });
    await db.insert(pushSubscription).values({ endpoint: `https://push.example/${secondary}`, userId: secondary, p256dh: 'k', auth: 'a', createdAt: NOW });
    await db.insert(announcement).values({ text: 'Привіт', createdBy: secondary, createdAt: NOW });
    await db.insert(botPlan).values({ quizId, title: 'План', startsAt: NOW, recipients: 'people', people: [petro], createdBy: secondary, createdAt: NOW, updatedAt: NOW });
    await db.insert(pushBroadcast).values({ createdBy: secondary, title: 'Розсилка', text: 'Текст', recipients: 'people', people: [petro], peopleCount: 1, createdAt: NOW });
    await db.insert(problemReport).values([
      { userId: secondary, fromAccount: true, text: 'Не відкривається таблиця', createdAt: NOW },
      { userId: petro, fromAccount: true, text: 'Зависла гра', status: 'resolved', resolvedBy: secondary, resolvedAt: NOW, createdAt: NOW },
    ]);
    await db.insert(serverError).values({ fingerprint: `f-${secondary}`, where: 'store', name: 'Error', message: 'boom', dayStart: NOW, firstAt: NOW, lastAt: NOW, status: 'resolved', resolvedBy: secondary, resolvedAt: NOW });
    await db.insert(adminAction).values({ at: PAST, adminId: secondary, adminLabel: 'Ольга', kind: 'ban', targetUserId: petro, targetLabel: 'Петро', details: {} });
    await db.insert(userBan).values({ userId: petro, reason: null, bannedBy: secondary, bannedAt: NOW });
    await db.insert(mergedEmail).values({ email: `old-${secondary}@example.com`, userId: secondary, mergedAt: NOW });

    const count = async (rows: Promise<unknown[]>) => (await rows).length;
    const left = async (id: string) => ({
      quiz: await count(db.select().from(quiz).where(eq(quiz.ownerId, id))),
      game: await count(db.select().from(game).where(eq(game.hostId, id))),
      libraryEntry: await count(db.select().from(libraryEntry).where(eq(libraryEntry.ownerId, id))),
      libraryCopy: await count(db.select().from(libraryCopy).where(eq(libraryCopy.userId, id))),
      push: await count(db.select().from(pushSubscription).where(eq(pushSubscription.userId, id))),
      announcement: await count(db.select().from(announcement).where(eq(announcement.createdBy, id))),
      botPlan: await count(db.select().from(botPlan).where(eq(botPlan.createdBy, id))),
      broadcast: await count(db.select().from(pushBroadcast).where(eq(pushBroadcast.createdBy, id))),
      problem: await count(db.select().from(problemReport).where(eq(problemReport.userId, id))),
      problemResolved: await count(db.select().from(problemReport).where(eq(problemReport.resolvedBy, id))),
      error: await count(db.select().from(serverError).where(eq(serverError.resolvedBy, id))),
      adminAction: await count(db.select().from(adminAction).where(eq(adminAction.adminId, id))),
      bannedBy: await count(db.select().from(userBan).where(eq(userBan.bannedBy, id))),
      mergedEmail: await count(db.select().from(mergedEmail).where(eq(mergedEmail.userId, id))),
    });
    const before = await left(secondary);
    expect(Object.entries(before).filter(([, value]) => value !== 1)).toEqual([]);

    await merge(ctx);

    expect(await left(primary)).toEqual(before);
    expect(Object.values(await left(secondary)).every((value) => value === 0)).toBe(true);
    expect(ctx.summary.quizzes).toBe(1);
    expect(ctx.summary.hosted).toBe(1);
  });

  it('inbox rows move to the primary; a broadcast both already have keeps the primary row and the read mark (70)', async () => {
    const { primary, secondary, ctx } = await pair();
    const broadcast = async (title: string) =>
      (await db.insert(pushBroadcast).values({ title, text: 'Текст', recipients: 'all', peopleCount: 2, createdAt: NOW }).returning())[0]!.id;
    const b1 = await broadcast('Перша');
    const b2 = await broadcast('Друга');
    const [problem] = await db
      .insert(problemReport)
      .values({ userId: secondary, fromAccount: true, text: 'Зависла гра', reply: 'Виправили', repliedAt: NOW, status: 'resolved', createdAt: PAST })
      .returning();
    const [kept] = await db.insert(inboxItem).values({ userId: primary, kind: 'broadcast', broadcastId: b1, createdAt: NOW }).returning();
    await db.insert(inboxItem).values([
      { userId: secondary, kind: 'broadcast', broadcastId: b1, createdAt: NOW, readAt: NOW },
      { userId: secondary, kind: 'broadcast', broadcastId: b2, createdAt: NOW },
      { userId: secondary, kind: 'problem_reply', problemId: problem.id, createdAt: NOW },
    ]);
    const summaryBefore = structuredClone(ctx.summary);

    await merge(ctx);

    const mine = await db.select().from(inboxItem).where(eq(inboxItem.userId, primary));
    expect(mine.map((row) => row.broadcastId ?? row.problemId).sort()).toEqual([b1, b2, problem.id].sort());
    // Прочитане в S лишається прочитаним у P.
    expect(mine.find((row) => row.broadcastId === b1)).toMatchObject({ id: kept.id, readAt: NOW });
    expect(mine.find((row) => row.broadcastId === b2)?.readAt).toBeNull();
    expect(await db.select().from(inboxItem).where(eq(inboxItem.userId, secondary))).toEqual([]);
    expect(ctx.summary).toEqual(summaryBefore);
  });

  it('activity days of the secondary are summed into the primary, the cap holds', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(activityDay).values([
      { userId: primary, day: '2026-11-20', editorSec: 100, editorSessions: 1 },
      { userId: secondary, day: '2026-11-20', editorSec: 57_550, editorSessions: 2 },
      { userId: secondary, day: '2026-11-21', editorSec: 30, editorSessions: 1 },
      // День лише з відвідуванням — нулі, теж переноситься.
      { userId: secondary, day: '2026-11-22' },
    ]);
    const summaryBefore = structuredClone(ctx.summary);

    await merge(ctx);

    const days = await db.select().from(activityDay).where(eq(activityDay.userId, primary));
    expect(days.map((row) => [row.day, row.editorSec, row.editorSessions]).sort()).toEqual([
      ['2026-11-20', 57_600, 3],
      ['2026-11-21', 30, 1],
      ['2026-11-22', 0, 0],
    ]);
    expect(await db.select().from(activityDay).where(eq(activityDay.userId, secondary))).toEqual([]);
    expect(ctx.summary).toEqual(summaryBefore);
  });

  it('a banned secondary throws and nothing moves', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    await ownQuiz(secondary);
    await db.insert(follow).values({ followerId: secondary, followeeId: petro });
    await db.insert(session).values({ id: `s-${secondary}`, token: `t-${secondary}`, userId: secondary, expiresAt: LATER });
    await db.insert(userBan).values({ userId: secondary, reason: 'спам', bannedAt: NOW });

    await expect(merge(ctx)).rejects.toThrow();

    expect(await db.select().from(quiz).where(eq(quiz.ownerId, secondary))).toHaveLength(1);
    expect(await db.select().from(follow).where(and(eq(follow.followerId, secondary), eq(follow.followeeId, petro)))).toHaveLength(1);
    expect(await db.select().from(session).where(eq(session.userId, secondary))).toHaveLength(1);
    expect(await db.select().from(quiz).where(eq(quiz.ownerId, primary))).toHaveLength(0);
  });

  it('every rule key names a table column', () => {
    const keys = PEOPLE_RULES.flatMap((rule) => rule.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
});
