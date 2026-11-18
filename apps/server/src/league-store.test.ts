import { LEAGUE_TITLES_SHOWN } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { game, groupMember, leagueChampion, leagueGame, leagueMonth, leaguePoint, user } from './db/schema';
import { createGroup, deleteGroup, updateGroup } from './group-store';
import { kyivMonth, leagueResultOf, leagueTable, leagueTitlesOf, recordLeague, settleLeague } from './league-store';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const NOW = new Date('2026-11-18T10:00:00Z');
const FINISHED = new Date('2026-11-17T19:00:00Z');

beforeAll(async () => {
  db = await createTestDb();
});

async function person(name: string) {
  n += 1;
  const id = `lg${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await ensureProfile(db, id);
  return id;
}

async function league(size: number) {
  const ids: string[] = [];
  for (let i = 0; i < size; i++) ids.push(await person(`Гравець ${i}`));
  const created = await createGroup(db, ids[0], { name: 'Родина', emoji: '🌻', description: '' }, NOW);
  if (!created.ok) throw new Error(created.error);
  for (const id of ids.slice(1)) await db.insert(groupMember).values({ groupId: created.id, userId: id, role: 'member', joinedAt: NOW });
  return { groupId: created.id, ids };
}

let gameN = 0;
async function finishedGame(hostId: string, finishedAt: Date | null = FINISHED) {
  gameN += 1;
  const id = `00000000-0000-4000-8000-${String(gameN).padStart(12, '0')}`;
  await db.insert(game).values({ id, hostId, code: 'ABCD', status: 'finished', title: 'Q', quizSnapshot: makeQuiz([single]), startedAt: FINISHED, finishedAt });
  return id;
}

async function tableOf(groupId: string, month: string | null) {
  const table = await leagueTable(db, groupId, month, NOW);
  if (table === null) throw new Error('group is gone');
  return table;
}

const solo = (ids: string[]) => ids.map((id, i) => ({ rank: i + 1, userIds: [id] }));
const names = (ids: string[]) => new Map(ids.map((id) => [id, `нік-${id}`]));

/** Гра минулого місяця з заданими місцями: прямий запис для таблиці. */
async function past(groupId: string, month: string, places: [string, number][]) {
  gameN += 1;
  const gameId = `00000000-0000-4000-9000-${String(gameN).padStart(12, '0')}`;
  await db.insert(leagueGame).values({ gameId, groupId, month, members: places.length, counted: true });
  await db.insert(leaguePoint).values(
    places.map(([userId, place]) => ({ gameId, userId, groupId, month, place, points: [10, 7, 5, 3, 1][place - 1] ?? 0, nickname: userId })),
  );
}

describe('kyivMonth', () => {
  it('cuts the month at Kyiv midnight, summer and winter time', () => {
    expect(kyivMonth(new Date('2026-10-31T21:30:00Z'))).toBe('2026-10');
    expect(kyivMonth(new Date('2026-10-31T22:10:00Z'))).toBe('2026-11');
    expect(kyivMonth(new Date('2026-03-31T20:30:00Z'))).toBe('2026-03');
    expect(kyivMonth(new Date('2026-03-31T21:10:00Z'))).toBe('2026-04');
  });
});

describe('recordLeague', () => {
  it('records a counted game once', async () => {
    const { groupId, ids } = await league(3);
    const gameId = await finishedGame(ids[0], new Date('2026-10-31T22:10:00Z'));
    const first = await recordLeague(db, { gameId, groupId, entries: solo(ids), nicknames: names(ids) });
    expect(first).toEqual({
      counted: true,
      rows: [
        { userId: ids[0], nickname: `нік-${ids[0]}`, points: 10 },
        { userId: ids[1], nickname: `нік-${ids[1]}`, points: 7 },
        { userId: ids[2], nickname: `нік-${ids[2]}`, points: 5 },
      ],
    });
    const [row] = await db.select().from(leagueGame).where(eq(leagueGame.gameId, gameId));
    expect(row).toMatchObject({ counted: true, month: '2026-11', members: 3 });

    const again = await recordLeague(db, { gameId, groupId, entries: solo([...ids].reverse()), nicknames: names(ids) });
    expect(again).toEqual(first);
    expect(await db.select().from(leaguePoint).where(eq(leaguePoint.gameId, gameId))).toHaveLength(3);
    expect(await leagueResultOf(db, gameId)).toEqual(first);
  });

  it('records once under concurrent calls', async () => {
    const { groupId, ids } = await league(3);
    const gameId = await finishedGame(ids[0]);
    const input = { gameId, groupId, entries: solo(ids), nicknames: names(ids) };
    const results = await Promise.all([1, 2, 3].map(() => db.transaction((tx) => recordLeague(tx, input))));
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(await db.select().from(leaguePoint).where(eq(leaguePoint.gameId, gameId))).toHaveLength(3);
  });

  it('a game with too few members is remembered as not counted', async () => {
    const { groupId, ids } = await league(2);
    const gameId = await finishedGame(ids[0]);
    const result = await recordLeague(db, { gameId, groupId, entries: solo(ids), nicknames: names(ids) });
    expect(result).toEqual({ counted: false, rows: [] });
    expect(await db.select().from(leaguePoint).where(eq(leaguePoint.gameId, gameId))).toEqual([]);

    const third = await person('Третій');
    await db.insert(groupMember).values({ groupId, userId: third, role: 'member', joinedAt: NOW });
    const again = await recordLeague(db, { gameId, groupId, entries: solo([...ids, third]), nicknames: names([...ids, third]) });
    expect(again).toEqual({ counted: false, rows: [] });
    expect(await db.select().from(leaguePoint).where(eq(leaguePoint.gameId, gameId))).toEqual([]);
  });

  it('a deleted group records nothing', async () => {
    const { groupId, ids } = await league(3);
    const gameId = await finishedGame(ids[0]);
    await deleteGroup(db, groupId);
    expect(await recordLeague(db, { gameId, groupId, entries: solo(ids), nicknames: names(ids) })).toBeNull();
    expect(await db.select().from(leagueGame).where(eq(leagueGame.gameId, gameId))).toEqual([]);
    expect(await leagueResultOf(db, gameId)).toBeNull();
  });
});

describe('leagueTable', () => {
  it('shows the current month for present members and past months with former ones', async () => {
    const { groupId, ids } = await league(4);
    const [a, b, c, d] = ids;
    await past(groupId, '2026-10', [[a, 1], [b, 2], [d, 3]]);
    await past(groupId, '2026-10', [[a, 1], [b, 2], [d, 3]]);
    await past(groupId, '2026-11', [[a, 1], [b, 2], [c, 3]]);
    await past(groupId, '2026-11', [[b, 1], [a, 2], [c, 3]]);
    await past(groupId, '2026-11', [[a, 1], [c, 2], [d, 3]]);
    await db.delete(groupMember).where(eq(groupMember.userId, d));

    const current = await tableOf(groupId, null);
    expect(current.month).toBe('2026-11');
    expect(current.current).toBe(true);
    expect(current.months).toEqual(['2026-11', '2026-10']);
    expect(current.rows.map((r) => [r.user.nickname === null ? null : r.user.nickname, r.points, r.games, r.firsts, r.place, r.former])).toEqual([
      [expect.any(String), 27, 3, 2, 1, false],
      [expect.any(String), 17, 2, 1, 2, false],
      [expect.any(String), 17, 3, 0, 3, false],
    ]);
    expect(current.rows.map((r) => r.user.nickname)).not.toContain(null);

    const october = await tableOf(groupId, '2026-10');
    expect(october.current).toBe(false);
    expect(october.rows.map((r) => [r.points, r.former])).toEqual([[20, false], [14, false], [10, true]]);
  });

  it('shares a place between equal rows and falls back to the current month for a bad or future month', async () => {
    const { groupId, ids } = await league(3);
    await past(groupId, '2026-11', [[ids[0], 1], [ids[1], 1], [ids[2], 3]]);
    const table = await tableOf(groupId, null);
    expect(table.rows.map((r) => [r.points, r.place])).toEqual([[10, 1], [10, 1], [5, 3]]);
    for (const bad of ['bad', '2027-01', '2026-13']) expect((await tableOf(groupId, bad)).month).toBe('2026-11');
  });
});

describe('settling', () => {
  it('settles a past month once, ties all win', async () => {
    const { groupId, ids } = await league(3);
    await past(groupId, '2026-10', [[ids[0], 1], [ids[1], 1], [ids[2], 3]]);
    await past(groupId, '2026-11', [[ids[2], 1], [ids[0], 2], [ids[1], 3]]);

    const table = await tableOf(groupId, null);
    const champs = await db.select().from(leagueChampion).where(eq(leagueChampion.groupId, groupId));
    expect(champs.map((c) => c.userId).sort()).toEqual([ids[0], ids[1]].sort());
    expect(champs.every((c) => c.groupName === 'Родина' && c.month === '2026-10' && c.points === 10)).toBe(true);
    expect(table.champions).toHaveLength(1);
    expect(table.champions[0].month).toBe('2026-10');
    expect(table.champions[0].users).toHaveLength(2);

    await updateGroup(db, groupId, { name: 'Інша', emoji: '🌻', description: '' }, NOW);
    await past(groupId, '2026-10', [[ids[2], 1], [ids[0], 2], [ids[1], 3]]);
    await tableOf(groupId, null);
    await settleLeague(db, groupId, NOW);
    const after = await db.select().from(leagueChampion).where(eq(leagueChampion.groupId, groupId));
    expect(after).toHaveLength(2);
    expect(after.every((c) => c.groupName === 'Родина')).toBe(true);
    expect(await db.select().from(leagueMonth).where(eq(leagueMonth.groupId, groupId))).toHaveLength(1);
  });

  it('settles once under concurrent requests', async () => {
    const { groupId, ids } = await league(3);
    await past(groupId, '2026-09', [[ids[0], 1], [ids[1], 2], [ids[2], 3]]);
    await Promise.all([1, 2, 3, 4].map(() => settleLeague(db, groupId, NOW)));
    expect(await db.select().from(leagueChampion).where(eq(leagueChampion.groupId, groupId))).toHaveLength(1);
  });

  it('does not settle the current month and skips months without games', async () => {
    const { groupId, ids } = await league(3);
    await past(groupId, '2026-11', [[ids[0], 1], [ids[1], 2], [ids[2], 3]]);
    await settleLeague(db, groupId, NOW);
    expect(await db.select().from(leagueMonth).where(eq(leagueMonth.groupId, groupId))).toEqual([]);
    expect(await db.select().from(leagueChampion).where(eq(leagueChampion.groupId, groupId))).toEqual([]);
    await settleLeague(db, groupId, new Date('2026-12-01T10:00:00Z'));
    expect(await db.select().from(leagueMonth).where(eq(leagueMonth.groupId, groupId))).toHaveLength(1);
  });

  it('a winner who has left the group is still a champion', async () => {
    const { groupId, ids } = await league(3);
    await past(groupId, '2026-10', [[ids[2], 1], [ids[0], 2], [ids[1], 3]]);
    await db.delete(groupMember).where(eq(groupMember.userId, ids[2]));
    await settleLeague(db, groupId, NOW);
    const champs = await db.select().from(leagueChampion).where(eq(leagueChampion.groupId, groupId));
    expect(champs.map((c) => c.userId)).toEqual([ids[2]]);
  });
});

describe('leagueTitlesOf', () => {
  it('titles reach the profile without opening the group', async () => {
    const { groupId, ids } = await league(3);
    await past(groupId, '2026-09', [[ids[1], 1], [ids[0], 2], [ids[2], 3]]);
    await past(groupId, '2026-10', [[ids[1], 1], [ids[0], 2], [ids[2], 3]]);
    await past(groupId, '2026-11', [[ids[1], 1], [ids[0], 2], [ids[2], 3]]);

    expect(await leagueTitlesOf(db, ids[1], NOW)).toEqual([
      { group: 'Родина', month: '2026-10' },
      { group: 'Родина', month: '2026-09' },
    ]);
    expect(await leagueTitlesOf(db, ids[0], NOW)).toEqual([]);

    await deleteGroup(db, groupId);
    expect(await leagueTitlesOf(db, ids[1], NOW)).toHaveLength(2);
  });

  it('shows at most the newest twelve', async () => {
    const { groupId, ids } = await league(3);
    const months = ['2024-11', '2024-12', ...Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`)];
    for (const month of months) await past(groupId, month, [[ids[0], 1], [ids[1], 2], [ids[2], 3]]);
    const titles = await leagueTitlesOf(db, ids[0], NOW);
    expect(titles).toHaveLength(LEAGUE_TITLES_SHOWN);
    expect(titles[0].month).toBe('2025-12');
  });
});

describe('leagueTable of a deleted group', () => {
  it('gives null instead of failing', async () => {
    const { groupId } = await league(3);
    await deleteGroup(db, groupId);
    expect(await leagueTable(db, groupId, null, NOW)).toBeNull();
  });
});
