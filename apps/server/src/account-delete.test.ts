import { BOT_USER_ID, DELETED_FACT, DELETED_NICKNAME } from '@quiz/shared';
import { makeQuiz, single } from '@quiz/engine/testing';
import { randomUUID } from 'node:crypto';
import { eq, or, sql } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { deleteAccount } from './account-delete';
import type { Db } from './db/client';
import * as schema from './db/schema';
import type { PlayRef } from './db/schema';
import {
  account,
  achievementBlock,
  adminAction,
  announcement,
  botPlan,
  calendarEvent,
  calendarRequest,
  challenge,
  challengeAttempt,
  familyGroup,
  feedEvent,
  follow,
  game,
  gameEvent,
  groupInvite,
  groupItem,
  groupMember,
  leagueChampion,
  leaguePoint,
  libraryCopy,
  libraryEntry,
  liveRoom,
  participant,
  scoreAdjustment,
  prize,
  prizeAward,
  profile,
  problemReport,
  pushBroadcast,
  pushSubscription,
  serverError,
  quiz,
  savedGame,
  session,
  showcasePin,
  user,
  userAchievement,
  userBan,
  userLike,
  userReport,
  userTitle,
  verification,
  xpEntry,
} from './db/schema';
import { playerHistory } from './history';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const ADMIN = 'ad-admin';
const NOW = new Date('2026-11-20T10:00:00.000Z');
const PAST = new Date('2026-11-01T10:00:00.000Z');
const quizOne = makeQuiz([single]);

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: ADMIN, name: 'Адмін', email: 'ad-admin@example.com' });
  await db.insert(profile).values({ userId: ADMIN, nickname: 'Адмін', nicknameKey: 'адмінд' });
});

/** Акаунт з профілем; нік — name без номера (унікальність ключа — номер у ключі). */
async function person(name: string, nickname: string | null = name): Promise<string> {
  n += 1;
  const id = `ad-${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname, nicknameKey: nickname === null ? null : `${nickname.toLowerCase()}${n}д` });
  return id;
}

async function ownQuiz(ownerId: string, title = 'Карпати'): Promise<string> {
  const [row] = await db.insert(quiz).values({ ownerId, title, description: '', settings: quizOne.settings, rounds: quizOne.rounds }).returning();
  return row.id;
}

async function group(owner: string, members: { userId: string; joinedAt: Date }[]): Promise<string> {
  const [row] = await db.insert(familyGroup).values({ name: 'Родина', emoji: '👪', inviteCode: `code-${randomUUID()}` }).returning();
  await db.insert(groupMember).values([{ groupId: row.id, userId: owner, role: 'owner', joinedAt: PAST }, ...members.map((m) => ({ groupId: row.id, userId: m.userId, role: 'member' as const, joinedAt: m.joinedAt }))]);
  return row.id;
}

const ADMIN_EMAILS = new Set(['ad-admin@example.com', 'ad-second@example.com']);
const del = (userId: string, adminId = ADMIN) => deleteAccount(db, { adminId, userId, now: NOW, adminEmails: ADMIN_EMAILS });

/** Кожна таблиця з посиланням на user: скільки рядків ще посилаються на userId. */
async function referencing(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const add = async (name: string, rows: Promise<unknown[]>) => {
    counts[name] = (await rows).length;
  };
  await add('user', db.select().from(user).where(eq(user.id, userId)));
  await add('session', db.select().from(session).where(eq(session.userId, userId)));
  await add('account', db.select().from(account).where(eq(account.userId, userId)));
  await add('verification', db.select().from(verification).where(eq(verification.value, userId)));
  await add('quiz', db.select().from(quiz).where(eq(quiz.ownerId, userId)));
  await add('game', db.select().from(game).where(eq(game.hostId, userId)));
  await add('participant', db.select().from(participant).where(eq(participant.userId, userId)));
  await add('game_event', db.select().from(gameEvent).where(eq(gameEvent.userId, userId)));
  await add('profile', db.select().from(profile).where(eq(profile.userId, userId)));
  await add('follow', db.select().from(follow).where(or(eq(follow.followerId, userId), eq(follow.followeeId, userId))));
  await add('user_achievement', db.select().from(userAchievement).where(eq(userAchievement.userId, userId)));
  await add('achievement_block', db.select().from(achievementBlock).where(eq(achievementBlock.userId, userId)));
  await add('prize', db.select().from(prize).where(eq(prize.ownerId, userId)));
  await add('prize_award', db.select().from(prizeAward).where(eq(prizeAward.userId, userId)));
  await add('user_title', db.select().from(userTitle).where(eq(userTitle.userId, userId)));
  await add('showcase_pin', db.select().from(showcasePin).where(eq(showcasePin.userId, userId)));
  await add('xp_entry', db.select().from(xpEntry).where(eq(xpEntry.userId, userId)));
  await add('user_like', db.select().from(userLike).where(or(eq(userLike.userId, userId), eq(userLike.targetUserId, userId))));
  await add('feed_event', db.select().from(feedEvent).where(eq(feedEvent.userId, userId)));
  await add('calendar_event', db.select().from(calendarEvent).where(eq(calendarEvent.hostId, userId)));
  await add('calendar_request', db.select().from(calendarRequest).where(eq(calendarRequest.userId, userId)));
  await add('push_subscription', db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId)));
  await add('user_ban', db.select().from(userBan).where(or(eq(userBan.userId, userId), eq(userBan.bannedBy, userId))));
  await add('admin_action.admin_id', db.select().from(adminAction).where(eq(adminAction.adminId, userId)));
  await add('group_member', db.select().from(groupMember).where(eq(groupMember.userId, userId)));
  await add('group_invite', db.select().from(groupInvite).where(or(eq(groupInvite.userId, userId), eq(groupInvite.invitedBy, userId))));
  await add('group_item', db.select().from(groupItem).where(eq(groupItem.authorId, userId)));
  await add('challenge', db.select().from(challenge).where(eq(challenge.ownerId, userId)));
  await add('challenge_attempt', db.select().from(challengeAttempt).where(eq(challengeAttempt.userId, userId)));
  await add('league_point', db.select().from(leaguePoint).where(eq(leaguePoint.userId, userId)));
  await add('league_champion', db.select().from(leagueChampion).where(eq(leagueChampion.userId, userId)));
  await add('library_entry', db.select().from(libraryEntry).where(eq(libraryEntry.ownerId, userId)));
  await add('library_copy', db.select().from(libraryCopy).where(eq(libraryCopy.userId, userId)));
  await add('user_report', db.select().from(userReport).where(or(eq(userReport.reporterId, userId), eq(userReport.targetUserId, userId))));
  await add('announcement', db.select().from(announcement).where(eq(announcement.createdBy, userId)));
  await add('bot_plan', db.select().from(botPlan).where(eq(botPlan.createdBy, userId)));
  await add('push_broadcast', db.select().from(pushBroadcast).where(eq(pushBroadcast.createdBy, userId)));
  await add('problem_report.user_id', db.select().from(problemReport).where(eq(problemReport.userId, userId)));
  await add('problem_report.resolved_by', db.select().from(problemReport).where(eq(problemReport.resolvedBy, userId)));
  await add('server_error.resolved_by', db.select().from(serverError).where(eq(serverError.resolvedBy, userId)));
  await add('push_broadcast.people', db.select().from(pushBroadcast).where(sql`${pushBroadcast.people} ? ${userId}::text`));
  await add('saved_game.data', db.select().from(savedGame).where(sql`${savedGame.data}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text))`));
  await add('live_room.data', db.select().from(liveRoom).where(sql`${liveRoom.data}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text)) or ${liveRoom.data}->>'hostUserId' = ${userId}`));
  return counts;
}

describe('deleteAccount', () => {
  it('the account and its personal data are gone', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    await db.insert(session).values({ id: `s-${taras}`, token: `t-${taras}`, userId: taras, expiresAt: NOW });
    await db.insert(account).values({ id: `a-${taras}`, accountId: taras, providerId: 'credential', userId: taras });
    await ownQuiz(taras);
    await db.insert(prize).values({ ownerId: taras, content: { name: 'Кубок', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false }, createdAt: NOW, updatedAt: NOW });
    await db.insert(xpEntry).values({ userId: taras, source: 'admin', amount: 10, note: 'за допомогу', day: '2026-11-20', at: NOW, createdAt: NOW });
    await db.insert(userAchievement).values({ userId: taras, achievementId: 'first_game', earnedAt: NOW });
    await db.insert(feedEvent).values({ key: `level:${taras}:2`, userId: taras, kind: 'level', data: { kind: 'level', level: 2 }, at: NOW, createdAt: NOW });
    await db.insert(follow).values([
      { followerId: taras, followeeId: olia },
      { followerId: olia, followeeId: taras },
    ]);

    expect(await del(taras)).toBe('deleted');

    const left = await referencing(taras);
    expect(Object.entries(left).filter(([, count]) => count > 0)).toEqual([]);
    expect(await db.select().from(user).where(eq(user.id, olia))).toHaveLength(1);
    const log = await db.select().from(adminAction).where(eq(adminAction.targetUserId, taras));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'account_delete', adminId: ADMIN, details: { text: 'Тарас' }, targetLabel: 'Тарас' });
  });

  it('a user with rows in every table that references him is deleted without orphans', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const petro = await person('Петро');
    const quizId = await ownQuiz(taras);
    const oliaQuiz = await ownQuiz(olia, 'Олині');
    await db.insert(session).values({ id: `s-${taras}`, token: `t-${taras}`, userId: taras, expiresAt: NOW });
    await db.insert(account).values({ id: `a-${taras}`, accountId: taras, providerId: 'credential', userId: taras });
    await db.insert(verification).values({ id: `v-${taras}`, identifier: `reset-password:${taras}`, value: taras, expiresAt: NOW });
    const finished = await seedGame(db, { hostId: taras, startedAt: PAST, players: [{ userId: olia, nickname: 'Оля', score: 10, rank: 1 }] });
    const running = await seedGame(db, { hostId: taras, status: 'running', startedAt: PAST, players: [{ userId: olia, nickname: 'Оля', score: 0, rank: null }] });
    const played = await seedGame(db, { hostId: olia, startedAt: PAST, players: [{ userId: taras, nickname: 'Тарас', score: 5, rank: 1 }] });
    // 65: подія гри з його акаунтом (вилучення з рахунком).
    const [tarasEvent] = await db
      .insert(gameEvent)
      .values({ id: randomUUID(), gameId: played.gameId, at: PAST, questionIndex: 0, kind: 'leave', participantId: played.participantIds[0], userId: taras, nickname: 'Тарас', details: { score: 5 } })
      .returning();
    await db.insert(follow).values([
      { followerId: taras, followeeId: olia },
      { followerId: olia, followeeId: taras },
    ]);
    await db.insert(userAchievement).values({ userId: taras, achievementId: 'first_game', earnedAt: PAST, gameId: played.gameId });
    await db.insert(achievementBlock).values({ userId: taras, achievementId: 'first_win', blockedAt: NOW });
    const [own] = await db
      .insert(prize)
      .values({ ownerId: taras, content: { name: 'Кубок', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false }, createdAt: NOW, updatedAt: NOW })
      .returning();
    const [award] = await db
      .insert(prizeAward)
      .values({ userId: taras, prizeId: own.id, gameId: played.gameId, place: 1, content: own.content, quizTitle: 'Гра', nickname: 'Тарас', awardedAt: NOW })
      .returning();
    await db.insert(userTitle).values({ userId: taras, text: 'Майстер', gameId: played.gameId, awardedAt: NOW, expiresAt: NOW });
    await db.insert(showcasePin).values({ userId: taras, kind: 'prize', itemId: award.id, slot: 0, pinnedAt: NOW });
    await db.insert(xpEntry).values({ userId: taras, source: 'game', gameId: played.gameId, amount: 10, day: '2026-11-01', at: PAST, createdAt: NOW });
    await db.insert(userLike).values([
      { userId: taras, kind: 'quiz', targetUserId: olia, quizId: oliaQuiz, createdAt: NOW },
      { userId: olia, kind: 'quiz', targetUserId: taras, quizId, createdAt: NOW },
    ]);
    await db.insert(feedEvent).values({ key: `level:${taras}:2`, userId: taras, kind: 'level', data: { kind: 'level', level: 2 }, at: NOW, createdAt: NOW });
    const [event] = await db.insert(calendarEvent).values({ hostId: taras, title: 'Вечір', quizId, startsAt: NOW, createdAt: NOW }).returning();
    const [oliaEvent] = await db.insert(calendarEvent).values({ hostId: olia, title: 'Олин вечір', startsAt: NOW, createdAt: NOW }).returning();
    await db.insert(calendarRequest).values([
      { eventId: event.id, userId: olia, status: 'pending', requestedAt: NOW },
      { eventId: oliaEvent.id, userId: taras, status: 'pending', requestedAt: NOW },
    ]);
    await db.insert(pushSubscription).values({ endpoint: `https://push.example/${taras}`, userId: taras, p256dh: 'k', auth: 'a', createdAt: NOW });
    await db.insert(userBan).values([
      { userId: taras, reason: 'спам', bannedBy: ADMIN, bannedAt: NOW },
      { userId: petro, reason: null, bannedBy: taras, bannedAt: NOW },
    ]);
    await db.insert(adminAction).values({ at: PAST, adminId: taras, adminLabel: 'Тарас', kind: 'ban', targetUserId: petro, targetLabel: 'Петро', details: {} });
    const groupId = await group(taras, [{ userId: olia, joinedAt: NOW }]);
    const oliaGroup = await group(olia, []);
    await db.insert(groupInvite).values([
      { groupId: oliaGroup, userId: taras, invitedBy: olia, createdAt: NOW },
      { groupId, userId: petro, invitedBy: taras, createdAt: NOW },
    ]);
    const [item] = await db
      .insert(groupItem)
      .values({ groupId: oliaGroup, authorId: taras, kind: 'fact', text: 'Любить гори', about: [{ kind: 'member', userId: taras, name: 'Тарас' }] })
      .returning();
    const [challengeRow] = await db
      .insert(challenge)
      .values({ code: `c-${taras}`, quizId, ownerId: taras, title: 'Виклик', quizSnapshot: quizOne, createdAt: NOW, expiresAt: NOW })
      .returning();
    const [oliaChallenge] = await db
      .insert(challenge)
      .values({ code: `c-${olia}`, quizId: oliaQuiz, ownerId: olia, title: 'Олин виклик', quizSnapshot: quizOne, createdAt: NOW, expiresAt: NOW })
      .returning();
    await db.insert(challengeAttempt).values([
      { challengeId: challengeRow.id, userId: olia, gameId: randomUUID(), nickname: 'Оля', startedAt: NOW },
      { challengeId: oliaChallenge.id, userId: taras, gameId: randomUUID(), nickname: 'Тарас', startedAt: NOW },
    ]);
    await db.insert(leaguePoint).values({ gameId: played.gameId, userId: taras, groupId: oliaGroup, month: '2026-11', place: 1, points: 3, nickname: 'Тарас' });
    await db.insert(leagueChampion).values({ groupId: oliaGroup, groupName: 'Родина', month: '2026-10', userId: taras, points: 3 });
    const [entry] = await db
      .insert(libraryEntry)
      .values({ quizId, ownerId: taras, title: 'Карпати', description: '', language: 'uk', snapshot: quizOne, questionCount: 1, roundTypes: ['classic'], listed: true, openedAt: NOW, updatedAt: NOW })
      .returning();
    const [oliaEntry] = await db
      .insert(libraryEntry)
      .values({ quizId: oliaQuiz, ownerId: olia, title: 'Олині', description: '', language: 'uk', snapshot: quizOne, questionCount: 1, roundTypes: ['classic'], listed: true, openedAt: NOW, updatedAt: NOW })
      .returning();
    await db.insert(libraryCopy).values([
      { entryId: entry.id, userId: olia, quizId: oliaQuiz, authorLine: 'Автор: Тарас', at: NOW },
      { entryId: oliaEntry.id, userId: taras, quizId, authorLine: 'Автор: Оля', at: NOW },
    ]);
    await db.insert(userReport).values([
      { reporterId: taras, targetKind: 'profile', targetUserId: olia, reason: 'spam' },
      { reporterId: olia, targetKind: 'quiz', entryId: entry.id, targetUserId: taras, reason: 'spam' },
    ]);
    await db.insert(announcement).values({ text: 'Привіт', createdBy: taras, createdAt: NOW });
    await db.insert(botPlan).values({ quizId, title: 'План', startsAt: NOW, recipients: 'people', people: [taras, olia], createdBy: taras, createdAt: NOW, updatedAt: NOW });
    await db.insert(pushBroadcast).values({ createdBy: taras, title: 'Розсилка', text: 'Текст', recipients: 'people', people: [taras, olia], peopleCount: 2, createdAt: NOW });
    await db.insert(problemReport).values([
      { userId: taras, fromAccount: true, text: 'Не відкривається таблиця', createdAt: NOW },
      { userId: olia, fromAccount: true, text: 'Зависла гра', status: 'resolved', resolvedBy: taras, resolvedAt: NOW, createdAt: NOW },
    ]);
    await db.insert(serverError).values({ fingerprint: 'f', where: 'store', name: 'Error', message: 'boom', dayStart: NOW, firstAt: NOW, lastAt: NOW, status: 'resolved', resolvedBy: taras, resolvedAt: NOW });
    const oliaSaved = await seedGame(db, { hostId: olia, status: 'saved', startedAt: PAST, players: [{ userId: taras, nickname: 'Тарас', score: 0, rank: null }] });
    await db.insert(savedGame).values({ gameId: oliaSaved.gameId, data: { v: 1, playerUsers: [['p-taras', taras], ['p-olia', olia]] }, stateVersion: 22, savedAt: NOW });
    await db.insert(liveRoom).values({ code: `r-${n}`, roomId: randomUUID(), data: { playerUsers: [['p-taras', taras], ['p-olia', olia]], continued: { bound: ['p-taras', 'p-olia'], carry: null, replaces: null } }, updatedAt: NOW });
    await db.insert(liveRoom).values({ code: `h-${n}`, roomId: randomUUID(), data: { hostUserId: taras, playerUsers: [['p-olia', olia]] }, updatedAt: NOW });

    const before = await referencing(taras);
    const tables = Object.keys(before);
    expect(tables.filter((name) => before[name] === 0)).toEqual([]);

    expect(await del(taras)).toBe('deleted');

    const after = await referencing(taras);
    expect(Object.entries(after).filter(([, count]) => count > 0)).toEqual([]);

    // Чуже лишилося.
    expect((await db.select().from(game).where(eq(game.id, finished.gameId)))[0]?.hostId).toBe(BOT_USER_ID);
    expect((await db.select().from(game).where(eq(game.id, running.gameId)))[0]?.hostId).toBe(BOT_USER_ID);
    expect((await db.select().from(game).where(eq(game.id, played.gameId)))[0]?.hostId).toBe(olia);
    expect(await db.select().from(calendarEvent).where(eq(calendarEvent.id, oliaEvent.id))).toHaveLength(1);
    expect(await db.select().from(challenge).where(eq(challenge.id, oliaChallenge.id))).toHaveLength(1);
    expect((await db.select().from(groupItem).where(eq(groupItem.id, item.id)))[0]?.authorId).toBeNull();
    expect((await db.select().from(userBan).where(eq(userBan.userId, petro)))[0]?.bannedBy).toBeNull();
    expect((await db.select().from(libraryCopy).where(eq(libraryCopy.userId, olia)))[0]).toMatchObject({ entryId: null, authorLine: 'Автор: Тарас' });
    expect((await db.select().from(botPlan))[0]?.people).toEqual([olia]);
    expect((await db.select().from(pushBroadcast))[0]).toMatchObject({ people: [olia], createdBy: null, peopleCount: 2 });
    // 64: скарга лишається як від видаленого акаунта; хто вирішив — забуто.
    expect((await db.select().from(problemReport).where(eq(problemReport.text, 'Не відкривається таблиця')))[0]).toMatchObject({ userId: null, fromAccount: true });
    expect((await db.select().from(problemReport).where(eq(problemReport.userId, olia)))[0]).toMatchObject({ resolvedBy: null, status: 'resolved' });
    expect((await db.select().from(serverError))[0]).toMatchObject({ resolvedBy: null, status: 'resolved' });
    expect((await db.select().from(savedGame).where(eq(savedGame.gameId, oliaSaved.gameId)))[0]?.data).toEqual({ v: 1, playerUsers: [['p-olia', olia]], forgotten: ['p-taras'] });
    const [room] = await db.select().from(liveRoom).where(eq(liveRoom.code, `r-${n}`));
    expect(room.data).toEqual({ playerUsers: [['p-olia', olia]], forgotten: ['p-taras'], continued: { bound: ['p-olia'], carry: null, replaces: null } });
    const [hostedRoom] = await db.select().from(liveRoom).where(eq(liveRoom.code, `h-${n}`));
    expect(hostedRoom.data).toEqual({ hostUserId: BOT_USER_ID, playerUsers: [['p-olia', olia]] });
    expect((await db.select().from(groupItem).where(eq(groupItem.id, item.id)))[0]?.about).toEqual([{ kind: 'member', userId: taras, name: DELETED_NICKNAME }]);
    // 65: його подія в чужій грі лишається «Видаленим гравцем» без акаунта.
    expect((await db.select().from(gameEvent).where(eq(gameEvent.id, tarasEvent.id)))[0]).toMatchObject({ nickname: DELETED_NICKNAME, userId: null, details: { score: 5 } });
    const [owner] = await db.select().from(groupMember).where(eq(groupMember.groupId, groupId));
    expect(owner).toMatchObject({ userId: olia, role: 'owner' });
  });

  it('games of others keep him as the deleted player', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const g = await seedGame(db, {
      hostId: olia,
      startedAt: PAST,
      players: [
        { userId: olia, nickname: 'Оля', score: 10, rank: 1 },
        { userId: taras, nickname: 'Тарас', score: 5, rank: 2 },
      ],
    });
    expect(await del(taras)).toBe('deleted');
    expect((await playerHistory(db, olia)).map((p) => p.gameId)).toContain(g.gameId);
    const [row] = await db.select().from(participant).where(eq(participant.id, g.participantIds[1]));
    expect(row).toMatchObject({ nickname: DELETED_NICKNAME, userId: null });
    const [hers] = await db.select().from(participant).where(eq(participant.id, g.participantIds[0]));
    expect(hers).toMatchObject({ nickname: 'Оля', userId: olia });
  });

  it("his name and his truth fact leave the plays of others' games", async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const truthQuestion = (authorId: string, fact: string, ids: [string, string]) => ({
      id: 'truth-0',
      type: 'single' as const,
      text: fact,
      options: [
        { id: ids[0], text: 'Оля' },
        { id: ids[1], text: 'Тарас' },
      ],
      correctId: authorId,
      points: 10,
      timeLimit: 30,
      imageUrl: null,
      video: null,
    });
    const players = [
      { userId: olia, nickname: 'Оля', score: 10, rank: 1 },
      { userId: taras, nickname: 'Тарас', score: 5, rank: 2 },
    ];
    const g = await seedGame(db, { hostId: olia, startedAt: PAST, players });
    const [oliaId, tarasId] = g.participantIds as [string, string];
    const plays: PlayRef[] = [
      { roundIndex: 0, questionId: 'truth-0', truth: { question: truthQuestion(tarasId, 'Боїться павуків', [oliaId, tarasId]), author: tarasId, authorName: 'Тарас', actor: tarasId } },
      { roundIndex: 0, questionId: 'truth-1', truth: { question: truthQuestion(oliaId, 'Любить каву', [oliaId, tarasId]), author: oliaId, authorName: 'Оля', actor: oliaId } },
      { roundIndex: 1, questionId: 'd1', drawing: { drawer: 'Тарас', strokes: 'abc' } },
      { roundIndex: 1, questionId: 'd2', drawing: { drawer: 'Оля', strokes: 'def' } },
      {
        roundIndex: 2,
        questionId: 't1',
        think: {
          words: [],
          lives: { [oliaId]: 3, [tarasId]: 0 },
          revealed: true,
          hit: [tarasId],
          places: [
            { nickname: 'Оля', place: 1, lives: 3, outAt: null, points: 10 },
            { nickname: 'Тарас', place: 2, lives: 0, outAt: 1, points: 0 },
          ],
        },
      },
    ];
    await db.update(game).set({ plays }).where(eq(game.id, g.gameId));
    // Гра, де Тараса не було: тезка в журналі лишається.
    const other = await seedGame(db, { hostId: olia, startedAt: PAST, players: [{ userId: olia, nickname: 'Оля', score: 1, rank: 1 }] });
    const otherPlays: PlayRef[] = [{ roundIndex: 0, questionId: 'd1', drawing: { drawer: 'Тарас', strokes: 'x' } }];
    await db.update(game).set({ plays: otherPlays }).where(eq(game.id, other.gameId));

    expect(await del(taras)).toBe('deleted');

    const [row] = await db.select({ plays: game.plays }).from(game).where(eq(game.id, g.gameId));
    const [mine, hers, drawn, drawnByHer, think] = row.plays;
    expect(mine.truth).toMatchObject({ author: tarasId, authorName: DELETED_NICKNAME, question: { text: DELETED_FACT } });
    expect(mine.truth?.question.type === 'single' && mine.truth.question.options.map((o) => o.text)).toEqual(['Оля', DELETED_NICKNAME]);
    expect(hers.truth).toMatchObject({ authorName: 'Оля', question: { text: 'Любить каву' } });
    expect(hers.truth?.question.type === 'single' && hers.truth.question.options.map((o) => o.text)).toEqual(['Оля', DELETED_NICKNAME]);
    expect(drawn.drawing).toEqual({ drawer: DELETED_NICKNAME, strokes: 'abc' });
    expect(drawnByHer.drawing).toEqual({ drawer: 'Оля', strokes: 'def' });
    expect(think.think?.places?.map((p) => p.nickname)).toEqual(['Оля', DELETED_NICKNAME]);
    expect(JSON.stringify(row.plays)).not.toContain('Тарас');
    expect(JSON.stringify(row.plays)).not.toContain('павуків');
    expect((await db.select({ plays: game.plays }).from(game).where(eq(game.id, other.gameId)))[0]?.plays).toEqual(otherPlays);
  });

  it("finished games he hosted stay in players' history", async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const finished = await seedGame(db, { hostId: taras, startedAt: PAST, players: [{ userId: olia, nickname: 'Оля', score: 10, rank: 1 }] });
    const saved = await seedGame(db, { hostId: taras, status: 'saved', startedAt: PAST, players: [{ userId: olia, nickname: 'Оля', score: 0, rank: null }] });
    await db.insert(savedGame).values({ gameId: saved.gameId, data: null, stateVersion: null, savedAt: NOW });
    expect(await del(taras)).toBe('deleted');
    expect((await playerHistory(db, olia)).map((p) => p.gameId)).toContain(finished.gameId);
    expect((await db.select().from(game).where(eq(game.id, finished.gameId)))[0]?.hostId).toBe(BOT_USER_ID);
    expect(await db.select().from(game).where(eq(game.id, saved.gameId))).toEqual([]);
    expect(await db.select().from(savedGame).where(eq(savedGame.gameId, saved.gameId))).toEqual([]);
  });

  it('a saved game where he played continues without him', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const petro = await person('Петро');
    const g = await seedGame(db, { hostId: olia, status: 'saved', startedAt: PAST, players: [{ userId: taras, nickname: 'Тарас', score: 0, rank: null }] });
    const data = { v: 1, stateVersion: 22, state: { players: [] }, at: 0, quizId: null, playerUsers: [['p-taras', taras], ['p-petro', petro]] };
    await db.insert(savedGame).values({ gameId: g.gameId, data, stateVersion: 22, savedAt: NOW });
    expect(await del(taras)).toBe('deleted');
    const [row] = await db.select().from(savedGame).where(eq(savedGame.gameId, g.gameId));
    expect(row.data).toEqual({ ...data, playerUsers: [['p-petro', petro]], forgotten: ['p-taras'] });
    expect(row.savedAt).toEqual(NOW);
  });

  it('a group he owned gets the earliest member as owner; a group of one is deleted', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const petro = await person('Петро');
    const shared = await group(taras, [
      { userId: olia, joinedAt: new Date('2026-11-05T00:00:00.000Z') },
      { userId: petro, joinedAt: new Date('2026-11-03T00:00:00.000Z') },
    ]);
    const alone = await group(taras, []);
    const member = await group(olia, [{ userId: taras, joinedAt: NOW }]);
    expect(await del(taras)).toBe('deleted');
    const rows = await db.select().from(groupMember).where(eq(groupMember.groupId, shared));
    expect(rows.map((r) => [r.userId, r.role]).sort()).toEqual([
      [olia, 'member'],
      [petro, 'owner'],
    ]);
    expect(await db.select().from(familyGroup).where(eq(familyGroup.id, alone))).toEqual([]);
    expect(await db.select().from(familyGroup).where(eq(familyGroup.id, shared))).toHaveLength(1);
    expect((await db.select().from(groupMember).where(eq(groupMember.groupId, member))).map((r) => [r.userId, r.role])).toEqual([[olia, 'owner']]);
  });

  it('the confirmation label falls back to the email without a nickname', async () => {
    const nameless = await person('Без ніку', null);
    expect(await del(nameless)).toBe('deleted');
    const [line] = await db.select().from(adminAction).where(eq(adminAction.targetUserId, nameless));
    expect(line.details).toEqual({ text: `${nameless}@example.com` });
  });

  it('refuses admins, oneself and the bot inside the procedure', async () => {
    const second = await person('Друга');
    await db.update(user).set({ email: 'ad-second@example.com', emailVerified: true }).where(eq(user.id, second));
    const before = (await db.select().from(adminAction)).length;
    expect(await del(second)).toBe('cannot_delete_admin');
    expect(await del(ADMIN)).toBe('cannot_delete_admin');
    expect(await del(BOT_USER_ID)).toBe('cannot_delete_admin');
    const plain = await person('Звичайний');
    expect(await del(plain, plain)).toBe('cannot_delete_admin');
    expect(await db.select().from(user).where(eq(user.id, second))).toHaveLength(1);
    expect(await db.select().from(user).where(eq(user.id, plain))).toHaveLength(1);
    expect(await db.select().from(adminAction)).toHaveLength(before);
  });

  it('a debuff aimed at him in another game names the deleted player', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const g = await seedGame(db, {
      hostId: olia,
      startedAt: PAST,
      players: [
        { userId: olia, nickname: 'Оля', score: 10, rank: 1, adjustments: [{ seq: 1, points: -5, source: 'debuff', debuff: 'fog', targetNickname: 'Тарас' }, { seq: 2, points: -5, source: 'debuff', debuff: 'fog', targetNickname: 'Гість' }] },
        { userId: taras, nickname: 'Тарас', score: 5, rank: 2 },
        { userId: null, nickname: 'Гість', score: 1, rank: 3 },
      ],
    });
    const otherGame = await seedGame(db, {
      hostId: olia,
      startedAt: PAST,
      players: [{ userId: olia, nickname: 'Оля', score: 1, rank: 1, adjustments: [{ seq: 1, points: -5, source: 'debuff', debuff: 'fog', targetNickname: 'Тарас' }] }],
    });
    expect(await del(taras)).toBe('deleted');
    const rows = await db.select().from(scoreAdjustment).where(eq(scoreAdjustment.participantId, g.participantIds[0]));
    expect(rows.map((r) => [r.seq, r.targetNickname]).sort()).toEqual([
      [1, DELETED_NICKNAME],
      [2, 'Гість'],
    ]);
    // Інша гра, де Тараса не було: тезка лишається.
    expect((await db.select().from(scoreAdjustment).where(eq(scoreAdjustment.participantId, otherGame.participantIds[0])))[0]?.targetNickname).toBe('Тарас');
  });

  it('unknown user → not_found and no log line', async () => {
    const before = (await db.select().from(adminAction)).length;
    expect(await del('ad-nobody')).toBe('not_found');
    expect(await db.select().from(adminAction)).toHaveLength(before);
  });

  it('a failure in the middle deletes nothing', async () => {
    const taras = await person('Тарас');
    const olia = await person('Оля');
    const g = await seedGame(db, { hostId: olia, startedAt: PAST, players: [{ userId: taras, nickname: 'Тарас', score: 5, rank: 1 }] });
    // Тригер, що ламає видалення рядка user: транзакція має відкотитися повністю.
    await db.execute(sql`create or replace function ad_fail() returns trigger as $$ begin raise exception 'boom'; end $$ language plpgsql`);
    await db.execute(sql`create trigger ad_fail before delete on "user" for each row when (old.id = ${sql.raw(`'${taras}'`)}) execute function ad_fail()`);
    try {
      await expect(del(taras)).rejects.toThrow();
    } finally {
      await db.execute(sql`drop trigger ad_fail on "user"`);
    }
    expect(await db.select().from(user).where(eq(user.id, taras))).toHaveLength(1);
    expect((await db.select().from(participant).where(eq(participant.id, g.participantIds[0])))[0]).toMatchObject({ nickname: 'Тарас', userId: taras });
    expect(await db.select().from(adminAction).where(eq(adminAction.targetUserId, taras))).toEqual([]);
  });
});


/** Кожен зовнішній ключ на user.id — у referencing вище; нова таблиця з ключем на user має з'явитися і там, і в deleteAccount. */
const HANDLED = [
  'session.user_id', 'account.user_id', 'quiz.owner_id', 'game.host_id', 'participant.user_id', 'profile.user_id',
  'follow.follower_id', 'follow.followee_id', 'user_achievement.user_id', 'achievement_block.user_id', 'prize.owner_id',
  'prize_award.user_id', 'user_title.user_id', 'showcase_pin.user_id', 'xp_entry.user_id', 'user_like.user_id',
  'user_like.target_user_id', 'feed_event.user_id', 'calendar_event.host_id', 'calendar_request.user_id',
  'push_subscription.user_id', 'user_ban.user_id', 'user_ban.banned_by', 'admin_action.admin_id', 'group_member.user_id',
  'group_invite.user_id', 'group_invite.invited_by', 'group_item.author_id', 'challenge.owner_id', 'challenge_attempt.user_id',
  'league_point.user_id', 'league_champion.user_id', 'library_entry.owner_id', 'library_copy.user_id', 'user_report.reporter_id',
  'user_report.target_user_id', 'announcement.created_by', 'bot_plan.created_by', 'push_broadcast.created_by',
  'problem_report.user_id', 'problem_report.resolved_by', 'server_error.resolved_by', 'game_event.user_id',
];

describe('the schema', () => {
  it('every foreign key to user is covered by the deletion test', () => {
    const keys: string[] = [];
    for (const table of Object.values(schema)) {
      if (!(table instanceof PgTable)) continue;
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        if (ref.foreignTable !== user) continue;
        for (const column of ref.columns) keys.push(`${config.name}.${column.name}`);
      }
    }
    expect(keys.sort()).toEqual([...HANDLED].sort());
  });
});
