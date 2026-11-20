import { FAVORITE_STICKERS_MAX } from '@quiz/shared';
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { HISTORY_RULES, MERGE_JSON_RULES } from './account-merge-history';
import { applyMergeRules, MERGE_JSON_KEYS, MERGE_RULES, mergeContext, type MergeContext } from './account-merge-rules';
import type { Db } from './db/client';
import * as schema from './db/schema';
import {
  adminAction,
  botPlan,
  familyGroup,
  feedEvent,
  gameEvent,
  groupItem,
  groupMember,
  leagueChampion,
  leaguePoint,
  liveRoom,
  participant,
  profile,
  pushBroadcast,
  savedGame,
  user,
  userAchievement,
  userLike,
  xpEntry,
} from './db/schema';
import { playerHistory } from './history';
import { leagueTable } from './league-store';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { xpTotals } from './xp-store';

const NOW = new Date('2026-11-20T10:00:00.000Z');
const PAST = new Date('2026-11-01T10:00:00.000Z');
const EARLY = new Date('2026-10-01T10:00:00.000Z');

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
});

async function person(name: string): Promise<string> {
  n += 1;
  const id = `mh-${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname: name, nicknameKey: `${name.toLowerCase()}${n}і` });
  return id;
}

async function pair(): Promise<{ primary: string; secondary: string; ctx: MergeContext }> {
  const primary = await person('Оля');
  const secondary = await person('Ольга');
  return { primary, secondary, ctx: mergeContext(primary, secondary, 'Оля') };
}

const history = (ctx: MergeContext) => db.transaction((tx) => applyMergeRules(tx, ctx, HISTORY_RULES));
const json = (ctx: MergeContext) => db.transaction((tx) => applyMergeRules(tx, ctx, MERGE_JSON_RULES));

async function group(members: string[]): Promise<string> {
  const [row] = await db.insert(familyGroup).values({ name: 'Родина', emoji: '👪', inviteCode: `code-${randomUUID()}` }).returning();
  if (members.length > 0) await db.insert(groupMember).values(members.map((userId, i) => ({ groupId: row.id, userId, role: i === 0 ? ('owner' as const) : ('member' as const), joinedAt: PAST })));
  return row.id;
}

describe('history rules', () => {
  it('the same game twice keeps the row with more points for the primary and the other row stays as a guest row', async () => {
    const { primary, secondary, ctx } = await pair();
    const host = await person('Марта');
    const petro = await person('Петро');
    const played = await seedGame(db, {
      hostId: host,
      startedAt: PAST,
      players: [
        { userId: secondary, nickname: 'Ольга', score: 7, rank: 1 },
        { userId: petro, nickname: 'Петро', score: 5, rank: 2 },
        { userId: primary, nickname: 'Оля', score: 3, rank: 3 },
      ],
    });
    const alone = await seedGame(db, { hostId: host, startedAt: EARLY, players: [{ userId: secondary, nickname: 'Ольга', score: 4, rank: 1 }] });
    const before = await db.select().from(participant).where(eq(participant.gameId, played.gameId)).orderBy(asc(participant.id));
    await db.insert(gameEvent).values([
      { id: randomUUID(), gameId: played.gameId, at: PAST, questionIndex: -1, kind: 'join', participantId: played.participantIds[0], userId: secondary, nickname: 'Ольга', details: null },
      { id: randomUUID(), gameId: played.gameId, at: PAST, questionIndex: -1, kind: 'join', participantId: played.participantIds[2], userId: primary, nickname: 'Оля', details: null },
      { id: randomUUID(), gameId: played.gameId, at: PAST, questionIndex: -1, kind: 'join', participantId: played.participantIds[1], userId: petro, nickname: 'Петро', details: null },
      { id: randomUUID(), gameId: alone.gameId, at: EARLY, questionIndex: -1, kind: 'join', participantId: alone.participantIds[0], userId: secondary, nickname: 'Ольга', details: null },
    ]);

    await history(ctx);

    const after = await db.select().from(participant).where(eq(participant.gameId, played.gameId)).orderBy(asc(participant.id));
    expect(after.map((row) => [row.id, row.nickname, row.score, row.rank])).toEqual(before.map((row) => [row.id, row.nickname, row.score, row.rank]));
    const byId = new Map(after.map((row) => [row.id, row]));
    expect(byId.get(played.participantIds[0])!.userId).toBe(primary);
    expect(byId.get(played.participantIds[2])!.userId).toBeNull();
    expect(byId.get(played.participantIds[1])!.userId).toBe(petro);
    expect((await db.select().from(participant).where(eq(participant.gameId, alone.gameId)))[0].userId).toBe(primary);
    expect(ctx.secondaryWonGames).toEqual(new Set([played.gameId]));
    expect(ctx.summary).toMatchObject({ games: 2, sameGames: 1 });
    const games = (await playerHistory(db, primary)).filter((g) => g.gameId === played.gameId);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ score: 7 });

    const events = await db.select().from(gameEvent).where(inArray(gameEvent.gameId, [played.gameId, alone.gameId]));
    const byParticipant = new Map(events.map((row) => [row.participantId, row]));
    // Нік події — нік у грі, як participant.nickname: переноситься лише user_id.
    expect(byParticipant.get(played.participantIds[0])).toMatchObject({ userId: primary, nickname: 'Ольга' });
    expect(byParticipant.get(played.participantIds[2])).toMatchObject({ userId: null, nickname: 'Оля' });
    expect(byParticipant.get(played.participantIds[1])).toMatchObject({ userId: petro, nickname: 'Петро' });
    expect(byParticipant.get(alone.participantIds[0])).toMatchObject({ userId: primary, nickname: 'Ольга' });
  });

  it('a tie in the same game keeps the primary row and the secondary row becomes the guest', async () => {
    const { primary, secondary, ctx } = await pair();
    const host = await person('Марта');
    const played = await seedGame(db, {
      hostId: host,
      startedAt: PAST,
      players: [
        { userId: secondary, nickname: 'Ольга', score: 4, rank: 1 },
        { userId: primary, nickname: 'Оля', score: 4, rank: 1 },
      ],
    });
    await db.insert(gameEvent).values({ id: randomUUID(), gameId: played.gameId, at: PAST, questionIndex: 0, kind: 'leave', participantId: played.participantIds[0], userId: secondary, nickname: 'Ольга', details: null });

    await history(ctx);

    const rows = new Map((await db.select().from(participant).where(eq(participant.gameId, played.gameId))).map((row) => [row.id, row]));
    expect(rows.get(played.participantIds[0])).toMatchObject({ userId: null, nickname: 'Ольга', score: 4, rank: 1 });
    expect(rows.get(played.participantIds[1])).toMatchObject({ userId: primary, nickname: 'Оля', score: 4, rank: 1 });
    expect(ctx.secondaryWonGames.size).toBe(0);
    expect(ctx.summary).toMatchObject({ games: 0, sameGames: 1 });
    expect((await db.select().from(gameEvent).where(eq(gameEvent.gameId, played.gameId)))[0]).toMatchObject({ userId: null, nickname: 'Ольга' });
  });

  it('an achievement in both keeps the earlier date and its game', async () => {
    const { primary, secondary, ctx } = await pair();
    const host = await person('Марта');
    const early = await seedGame(db, { hostId: host, startedAt: EARLY, players: [] });
    const late = await seedGame(db, { hostId: host, startedAt: PAST, players: [] });
    await db.insert(userAchievement).values([
      { userId: secondary, achievementId: 'first_game', earnedAt: EARLY, gameId: early.gameId },
      { userId: primary, achievementId: 'first_game', earnedAt: PAST, gameId: late.gameId },
      { userId: secondary, achievementId: 'first_win', earnedAt: NOW, gameId: late.gameId },
      { userId: primary, achievementId: 'first_win', earnedAt: null, gameId: null },
      { userId: secondary, achievementId: 'perfect_game', earnedAt: null, gameId: null },
      { userId: primary, achievementId: 'perfect_game', earnedAt: PAST, gameId: late.gameId },
      { userId: secondary, achievementId: 'host', earnedAt: PAST, gameId: late.gameId },
    ]);

    await history(ctx);

    const rows = await db.select().from(userAchievement).where(inArray(userAchievement.userId, [primary, secondary]));
    expect(rows.map((row) => [row.userId, row.achievementId, row.earnedAt, row.gameId]).sort()).toEqual(
      [
        [primary, 'first_game', EARLY, early.gameId],
        [primary, 'first_win', null, null],
        [primary, 'host', PAST, late.gameId],
        [primary, 'perfect_game', null, null],
      ].sort(),
    );
    expect(ctx.earlierOnSecondary).toEqual(new Set(['first_game', 'perfect_game']));
    expect(ctx.summary).toMatchObject({ achievements: 1, sameAchievements: 3 });
  });

  it('xp is the sum of both journals and the same game keeps the larger amount', async () => {
    const { primary, secondary, ctx } = await pair();
    const shared = randomUUID();
    const row = (userId: string, values: Partial<typeof xpEntry.$inferInsert>) => ({ userId, source: 'game' as const, amount: 0, day: '2026-11-01', at: PAST, createdAt: NOW, ...values });
    await db.insert(xpEntry).values([
      row(secondary, { gameId: shared, amount: 30 }),
      row(primary, { gameId: shared, amount: 20 }),
      row(secondary, { gameId: randomUUID(), amount: 15 }),
      row(primary, { gameId: randomUUID(), amount: 5 }),
      row(secondary, { source: 'achievement', achievementId: 'first_game', amount: 50 }),
      row(primary, { source: 'achievement', achievementId: 'first_game', amount: 50 }),
      row(secondary, { source: 'admin', amount: 10, note: 'за допомогу' }),
      row(primary, { source: 'admin', amount: -3, note: 'вирівнювання' }),
    ]);

    await history(ctx);

    expect((await xpTotals(db, [primary])).get(primary)).toBe(30 + 15 + 5 + 50 + 10 - 3);
    const rows = await db.select().from(xpEntry).where(eq(xpEntry.userId, primary));
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.source === 'admin').map((r) => r.note).sort()).toEqual(['вирівнювання', 'за допомогу']);
    expect(rows.find((r) => r.gameId === shared)!.amount).toBe(30);
    expect(await db.select().from(xpEntry).where(eq(xpEntry.userId, secondary))).toEqual([]);
    expect(ctx.summary.xp).toBe(30 + 15 + 10);
  });

  it('league points of one game keep the larger, month totals add up, and champions of one month sum their points', async () => {
    const { primary, secondary, ctx } = await pair();
    const groupId = await group([primary]);
    const [g1, g2, g3] = [randomUUID(), randomUUID(), randomUUID()];
    const point = (gameId: string, userId: string, points: number, place: number) => ({ gameId, userId, groupId, month: '2026-11', place, points, nickname: 'Оля' });
    await db.insert(leaguePoint).values([point(g1, secondary, 5, 1), point(g1, primary, 3, 2), point(g2, secondary, 4, 1), point(g3, primary, 2, 1)]);
    await db.insert(leagueChampion).values([
      { groupId, groupName: 'Родина', month: '2026-10', userId: secondary, points: 3 },
      { groupId, groupName: 'Родина', month: '2026-10', userId: primary, points: 2 },
      { groupId, groupName: 'Родина', month: '2026-09', userId: secondary, points: 6 },
      { groupId: null, groupName: 'Друзі', month: '2026-08', userId: secondary, points: 4 },
      { groupId: null, groupName: 'Друзі', month: '2026-08', userId: primary, points: 1 },
      { groupId: null, groupName: 'Сусіди', month: '2026-08', userId: secondary, points: 7 },
    ]);

    await history(ctx);

    const table = await leagueTable(db, groupId, '2026-11', NOW);
    expect(table!.rows.map((row) => [row.user.id, row.points, row.games])).toEqual([[primary, 11, 3]]);
    expect((await db.select().from(leaguePoint).where(eq(leaguePoint.gameId, g1))).map((row) => [row.userId, row.points])).toEqual([[primary, 5]]);
    const champions = await db.select().from(leagueChampion).where(inArray(leagueChampion.userId, [primary, secondary]));
    expect(champions.map((row) => [row.userId, row.groupName, row.month, row.points]).sort()).toEqual(
      [
        [primary, 'Родина', '2026-10', 5],
        [primary, 'Родина', '2026-09', 6],
        [primary, 'Друзі', '2026-08', 5],
        [primary, 'Сусіди', '2026-08', 7],
      ].sort(),
    );
    expect(ctx.summary.league).toBe(2);
  });

  it('feed events are rekeyed to the primary and a liked event keeps its like', async () => {
    const { primary, secondary, ctx } = await pair();
    const host = await person('Марта');
    const petro = await person('Петро');
    const solo = await seedGame(db, { hostId: host, startedAt: EARLY, players: [{ userId: secondary, nickname: 'Ольга', score: 4, rank: 1 }] });
    const won = await seedGame(db, {
      hostId: host,
      startedAt: PAST,
      players: [
        { userId: secondary, nickname: 'Ольга', score: 9, rank: 1 },
        { userId: primary, nickname: 'Оля', score: 2, rank: 2 },
      ],
    });
    const lost = await seedGame(db, {
      hostId: host,
      startedAt: PAST,
      players: [
        { userId: primary, nickname: 'Оля', score: 9, rank: 1 },
        { userId: secondary, nickname: 'Ольга', score: 2, rank: 2 },
      ],
    });
    const gameEventOf = (userId: string, gameId: string, place: number) => ({
      key: `game:${gameId}:${userId}`,
      userId,
      kind: 'game' as const,
      gameId,
      data: { kind: 'game' as const, title: 'Гра', place, of: 2, team: null },
      at: PAST,
      createdAt: PAST,
    });
    await db.insert(feedEvent).values([
      gameEventOf(secondary, solo.gameId, 1),
      gameEventOf(secondary, won.gameId, 1),
      gameEventOf(primary, won.gameId, 2),
      gameEventOf(secondary, lost.gameId, 2),
      gameEventOf(primary, lost.gameId, 1),
      { key: `level:${secondary}:3`, userId: secondary, kind: 'level', data: { kind: 'level', level: 3 }, at: NOW, createdAt: NOW },
      { key: `level:${primary}:3`, userId: primary, kind: 'level', data: { kind: 'level', level: 3 }, at: PAST, createdAt: PAST },
      { key: `prize:${randomUUID()}`, userId: secondary, kind: 'prize', data: { kind: 'prize', place: 1, name: 'Кубок', title: 'Гра', nickTitle: null }, at: NOW, createdAt: NOW },
    ]);
    const like = (eventKey: string, targetUserId: string) => ({ userId: petro, kind: 'event' as const, targetUserId, eventKey, createdAt: NOW });
    await db.insert(userLike).values([
      like(`game:${solo.gameId}:${secondary}`, secondary),
      like(`game:${won.gameId}:${secondary}`, secondary),
      like(`game:${won.gameId}:${primary}`, primary),
      like(`game:${lost.gameId}:${secondary}`, secondary),
    ]);

    await history(ctx);

    const events = await db.select().from(feedEvent).where(inArray(feedEvent.userId, [primary, secondary]));
    expect(events.every((row) => row.userId === primary)).toBe(true);
    const byKey = new Map(events.map((row) => [row.key, row]));
    expect(events).toHaveLength(5);
    expect(byKey.get(`game:${solo.gameId}:${primary}`)).toBeDefined();
    expect(byKey.get(`game:${won.gameId}:${primary}`)!.data).toMatchObject({ place: 1 });
    expect(byKey.get(`game:${lost.gameId}:${primary}`)!.data).toMatchObject({ place: 1 });
    expect(byKey.get(`level:${primary}:3`)!.at).toEqual(PAST);
    expect(events.some((row) => row.kind === 'prize')).toBe(true);

    const likes = await db.select().from(userLike).where(eq(userLike.userId, petro));
    expect(likes.map((row) => [row.eventKey, row.targetUserId]).sort()).toEqual(
      [
        [`game:${solo.gameId}:${primary}`, primary],
        [`game:${won.gameId}:${primary}`, primary],
        [`game:${lost.gameId}:${primary}`, primary],
      ].sort(),
    );
  });

  it('an achievement event follows the earlier date', async () => {
    const { primary, secondary, ctx } = await pair();
    await db.insert(userAchievement).values([
      { userId: secondary, achievementId: 'first_game', earnedAt: EARLY, gameId: null },
      { userId: primary, achievementId: 'first_game', earnedAt: PAST, gameId: null },
    ]);
    await db.insert(feedEvent).values([
      { key: `achievement:${secondary}:first_game`, userId: secondary, kind: 'achievement', data: { kind: 'achievement', achievementId: 'first_game' }, at: EARLY, createdAt: EARLY },
      { key: `achievement:${primary}:first_game`, userId: primary, kind: 'achievement', data: { kind: 'achievement', achievementId: 'first_game' }, at: PAST, createdAt: PAST },
    ]);

    await history(ctx);

    const events = await db.select().from(feedEvent).where(inArray(feedEvent.userId, [primary, secondary]));
    expect(events.map((row) => [row.key, row.userId, row.at])).toEqual([[`achievement:${primary}:first_game`, primary, EARLY]]);
  });

  it('likes of each other and duplicate likes are dropped', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const quizId = randomUUID();
    const gameId = randomUUID();
    const like = (userId: string, values: Partial<typeof userLike.$inferInsert> & Pick<typeof userLike.$inferInsert, 'kind' | 'targetUserId'>) => ({ userId, createdAt: NOW, ...values });
    await db.insert(userLike).values([
      like(secondary, { kind: 'quiz', targetUserId: primary, quizId }),
      like(primary, { kind: 'host', targetUserId: secondary, gameId }),
      like(secondary, { kind: 'question', targetUserId: petro, quizId, questionId: 'q1' }),
      like(primary, { kind: 'question', targetUserId: petro, quizId, questionId: 'q1' }),
      like(secondary, { kind: 'question', targetUserId: petro, quizId, questionId: 'q2' }),
      like(secondary, { kind: 'host', targetUserId: petro, gameId }),
      like(petro, { kind: 'player', targetUserId: secondary, gameId }),
      like(petro, { kind: 'player', targetUserId: primary, gameId }),
      like(petro, { kind: 'quiz', targetUserId: secondary, quizId }),
    ]);

    await history(ctx);

    const rows = await db.select().from(userLike).where(inArray(userLike.userId, [primary, secondary, petro]));
    expect(rows.map((row) => [row.userId, row.kind, row.targetUserId, row.questionId]).sort()).toEqual(
      [
        [primary, 'question', petro, 'q1'],
        [primary, 'question', petro, 'q2'],
        [primary, 'host', petro, null],
        [petro, 'player', primary, null],
        [petro, 'quiz', primary, null],
      ].sort(),
    );
    expect(ctx.summary.likes).toBe(2);
  });

  it('the profile keeps the primary nickname and avatar, takes the later last seen, the higher feed level and resets sync marks to the earlier', async () => {
    const { primary, secondary, ctx } = await pair();
    const many = Array.from({ length: FAVORITE_STICKERS_MAX }, (_, i) => `s${i}`);
    await db
      .update(profile)
      .set({ avatar: '/uploads/p.png', locale: 'uk', lastSeenAt: PAST, favoriteStickers: ['a', 'b'], feedLevel: 2, stickersLegacyLevel: null, stickersSettled: true, xpSyncedAt: PAST, achievementsSyncedAt: PAST, hideAnti: true })
      .where(eq(profile.userId, primary));
    await db
      .update(profile)
      .set({ avatar: '/uploads/s.png', locale: 'en', lastSeenAt: NOW, favoriteStickers: ['b', ...many], feedLevel: 5, stickersLegacyLevel: 4, stickersSettled: false, xpSyncedAt: EARLY, achievementsSyncedAt: null, hideAnti: false })
      .where(eq(profile.userId, secondary));

    await history(ctx);

    const [row] = await db.select().from(profile).where(eq(profile.userId, primary));
    expect(row).toMatchObject({
      nickname: 'Оля',
      avatar: '/uploads/p.png',
      locale: 'uk',
      hideAnti: true,
      lastSeenAt: NOW,
      feedLevel: 5,
      stickersLegacyLevel: 4,
      stickersSettled: false,
      xpSyncedAt: EARLY,
      achievementsSyncedAt: null,
    });
    expect(row.favoriteStickers).toEqual(['a', 'b', ...many].slice(0, FAVORITE_STICKERS_MAX));
  });
});

describe('json rules', () => {
  it('a saved game and a finished live room bind the primary seat, a second seat of the same person becomes a guest', async () => {
    const { primary, secondary, ctx } = await pair();
    const olia = await person('Марта');
    const one = await seedGame(db, { hostId: olia, status: 'saved', startedAt: PAST, players: [] });
    const two = await seedGame(db, { hostId: olia, status: 'saved', startedAt: PAST, players: [] });
    await db.insert(savedGame).values([
      { gameId: one.gameId, data: { v: 1, playerUsers: [['p1', secondary], ['p2', olia]] }, stateVersion: 22, savedAt: NOW },
      { gameId: two.gameId, data: { v: 1, playerUsers: [['p1', secondary], ['p2', primary]] }, stateVersion: 22, savedAt: NOW },
    ]);
    const code = `mr-${n}`;
    await db.insert(liveRoom).values([
      { code, roomId: randomUUID(), data: { hostUserId: secondary, playerUsers: [['p1', secondary], ['p2', primary]], state: { phase: 'finished' } }, updatedAt: NOW },
      { code: `${code}-b`, roomId: randomUUID(), data: { hostUserId: olia, playerUsers: [['p1', secondary], ['p2', olia]], state: { phase: 'finished' } }, updatedAt: NOW },
    ]);

    await json(ctx);

    const saved = new Map((await db.select().from(savedGame).where(inArray(savedGame.gameId, [one.gameId, two.gameId]))).map((row) => [row.gameId, row.data]));
    expect(saved.get(one.gameId)).toEqual({ v: 1, playerUsers: [['p1', primary], ['p2', olia]] });
    expect(saved.get(two.gameId)).toEqual({ v: 1, playerUsers: [['p2', primary]] });
    const rooms = new Map((await db.select().from(liveRoom).where(inArray(liveRoom.code, [code, `${code}-b`]))).map((row) => [row.code, row.data]));
    expect(rooms.get(code)).toEqual({ hostUserId: primary, playerUsers: [['p2', primary]], state: { phase: 'finished' } });
    expect(rooms.get(`${code}-b`)).toEqual({ hostUserId: olia, playerUsers: [['p1', primary], ['p2', olia]], state: { phase: 'finished' } });
  });

  it('when the secondary seat scored more, the saved game and the room keep that seat for the primary, like the game rows and events', async () => {
    const { primary, secondary, ctx } = await pair();
    const host = await person('Марта');
    const petro = await person('Петро');
    const players = [
      { userId: secondary, nickname: 'Ольга', score: 7, rank: 1 },
      { userId: petro, nickname: 'Петро', score: 5, rank: 2 },
      { userId: primary, nickname: 'Оля', score: 3, rank: 3 },
    ];
    const saved = await seedGame(db, { hostId: host, status: 'saved', startedAt: PAST, players });
    const roomGame = await seedGame(db, { hostId: host, startedAt: PAST, players });
    const seats = (ids: string[]) => [[ids[0], secondary], [ids[1], petro], [ids[2], primary]];
    await db.insert(savedGame).values({ gameId: saved.gameId, data: { v: 1, playerUsers: seats(saved.participantIds) }, stateVersion: 22, savedAt: NOW });
    const code = `mw-${n}`;
    await db.insert(liveRoom).values({ code, roomId: roomGame.gameId, data: { hostUserId: host, playerUsers: seats(roomGame.participantIds), state: { phase: 'finished' } }, updatedAt: NOW });
    await db.insert(gameEvent).values(
      saved.participantIds.map((participantId, i) => ({ id: randomUUID(), gameId: saved.gameId, at: PAST, questionIndex: -1, kind: 'join' as const, participantId, userId: players[i].userId, nickname: players[i].nickname, details: null })),
    );

    await db.transaction((tx) => applyMergeRules(tx, ctx, [...HISTORY_RULES, ...MERGE_JSON_RULES]));

    expect(ctx.secondaryWonGames).toEqual(new Set([saved.gameId, roomGame.gameId]));
    const [savedRow] = await db.select().from(savedGame).where(eq(savedGame.gameId, saved.gameId));
    expect(savedRow.data).toEqual({ v: 1, playerUsers: [[saved.participantIds[0], primary], [saved.participantIds[1], petro]] });
    const [roomRow] = await db.select().from(liveRoom).where(eq(liveRoom.code, code));
    expect(roomRow.data).toMatchObject({ playerUsers: [[roomGame.participantIds[0], primary], [roomGame.participantIds[1], petro]] });

    // Повторний запис гри (продовження збереженої, перезапис кімнати) бере user_id з playerUsers: він має збігтися з рядками гри.
    for (const [gameId, data] of [[saved.gameId, savedRow.data], [roomGame.gameId, roomRow.data]] as const) {
      const bound = new Map((data as { playerUsers: [string, string][] }).playerUsers);
      const rows = await db.select().from(participant).where(eq(participant.gameId, gameId));
      expect(rows.map((row) => [row.id, row.userId]).sort()).toEqual(rows.map((row) => [row.id, bound.get(row.id) ?? null]).sort());
    }
    const events = new Map((await db.select().from(gameEvent).where(eq(gameEvent.gameId, saved.gameId))).map((row) => [row.participantId, row.userId]));
    expect(saved.participantIds.map((id) => events.get(id))).toEqual([primary, petro, null]);
    // Історія гравця показує завершені ігри; рядок P у збереженій — теж з 7 балами.
    const history = (await playerHistory(db, primary)).filter((g) => g.gameId === roomGame.gameId);
    expect(history.map((g) => g.score)).toEqual([7]);
    const own = await db.select().from(participant).where(eq(participant.gameId, saved.gameId));
    expect(own.filter((row) => row.userId === primary).map((row) => row.score)).toEqual([7]);
  });

  it('group facts about the secondary now name the primary; bot plans and broadcasts list the primary once; admin log targets move', async () => {
    const { primary, secondary, ctx } = await pair();
    const petro = await person('Петро');
    const groupId = await group([primary]);
    const [single, both] = await db
      .insert(groupItem)
      .values([
        { groupId, authorId: petro, kind: 'fact', text: 'Любить гори', about: [{ kind: 'name', name: 'Бабуся' }, { kind: 'member', userId: secondary, name: 'Ольга' }] },
        { groupId, authorId: petro, kind: 'fact', text: 'Сестри', about: [{ kind: 'member', userId: primary, name: 'Оля' }, { kind: 'member', userId: secondary, name: 'Ольга' }, { kind: 'member', userId: petro, name: 'Петро' }] },
      ])
      .returning();
    const plan = (people: string[]) => ({ title: 'Гра', startsAt: NOW, recipients: 'people' as const, people, createdAt: NOW, updatedAt: NOW });
    const [alone, twice] = await db.insert(botPlan).values([plan([petro, secondary]), plan([primary, secondary, petro])]).returning();
    const broadcast = (people: string[]) => ({ title: 'Привіт', text: 'Гра о сьомій', recipients: 'people' as const, people, peopleCount: people.length, createdAt: NOW });
    const [b1, b2] = await db.insert(pushBroadcast).values([broadcast([secondary, petro]), broadcast([secondary, primary])]).returning();
    const [logged] = await db
      .insert(adminAction)
      .values({ at: NOW, adminId: petro, adminLabel: 'Петро', kind: 'achievement_grant', targetUserId: secondary, targetLabel: 'Ольга', details: {} })
      .returning();

    await json(ctx);

    const items = new Map((await db.select().from(groupItem).where(inArray(groupItem.id, [single.id, both.id]))).map((row) => [row.id, row.about]));
    expect(items.get(single.id)).toEqual([{ kind: 'name', name: 'Бабуся' }, { kind: 'member', userId: primary, name: 'Оля' }]);
    expect(items.get(both.id)).toEqual([{ kind: 'member', userId: primary, name: 'Оля' }, { kind: 'member', userId: petro, name: 'Петро' }]);
    const plans = new Map((await db.select().from(botPlan).where(inArray(botPlan.id, [alone.id, twice.id]))).map((row) => [row.id, row.people]));
    expect(plans.get(alone.id)).toEqual([petro, primary]);
    expect(plans.get(twice.id)).toEqual([primary, petro]);
    const sent = new Map((await db.select().from(pushBroadcast).where(inArray(pushBroadcast.id, [b1.id, b2.id]))).map((row) => [row.id, row]));
    expect(sent.get(b1.id)).toMatchObject({ people: [primary, petro], peopleCount: 2 });
    expect(sent.get(b2.id)).toMatchObject({ people: [primary], peopleCount: 2 });
    expect((await db.select().from(adminAction).where(eq(adminAction.id, logged.id)))[0]).toMatchObject({ targetUserId: primary, targetLabel: 'Ольга' });
  });
});

describe('the schema', () => {
  it('every foreign key to user has a merge rule', () => {
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
    expect(keys.sort()).toEqual(MERGE_RULES.flatMap((r) => r.keys).sort());
  });

  it('no key has two rules', () => {
    const keys = [...MERGE_RULES, ...MERGE_JSON_RULES].flatMap((r) => r.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every json blob with account ids has a rule', () => {
    expect([...MERGE_JSON_KEYS].sort()).toEqual(
      ['saved_game.data', 'live_room.data', 'group_item.about', 'bot_plan.people', 'push_broadcast.people', 'admin_action.target_user_id'].sort(),
    );
  });
});
