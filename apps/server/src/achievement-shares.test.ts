import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { achievementShares, forgetAchievementShares, SHARES_TTL_MS } from './achievement-shares';
import { user, userAchievement } from './db/schema';
import { seedGame } from './testing/history-rows';
import { createTestDb } from './testing/test-db';

const AT = new Date('2026-11-01T10:00:00Z');

async function makeUsers(db: Awaited<ReturnType<typeof createTestDb>>, n: number): Promise<string[]> {
  const ids = Array.from({ length: n }, () => randomUUID());
  await db.insert(user).values(ids.map((id, i) => ({ id, name: `Гравець ${i}`, email: `${id}@example.com` })));
  return ids;
}

beforeEach(forgetAchievementShares);

describe('achievement shares (49)', () => {
  it('counts players with a finished game and holders among them', async () => {
    const db = await createTestDb();
    const [host, unfinished, ...players] = await makeUsers(db, 14);
    await seedGame(db, { hostId: host!, startedAt: AT, players: players.map((id, i) => ({ userId: id, nickname: `P${i}`, score: 10, rank: i + 1 })) });
    await seedGame(db, { hostId: host!, status: 'running', startedAt: AT, players: [{ userId: unfinished!, nickname: 'U', score: 0, rank: null }] });
    await db.insert(userAchievement).values([
      ...players.slice(0, 3).map((id) => ({ userId: id, achievementId: 'first_win' as const, earnedAt: AT })),
      { userId: host!, achievementId: 'host' as const, earnedAt: AT },
      { userId: unfinished!, achievementId: 'first_win' as const, earnedAt: AT },
      { userId: players[0]!, achievementId: 'not_in_catalog' as never, earnedAt: AT },
    ]);
    const shares = await achievementShares(db);
    expect(shares.players).toBe(12);
    expect(shares.holders.first_win).toBe(3);
    expect(shares.holders.host).toBeUndefined();
    expect(Object.keys(shares.holders)).toEqual(['first_win']);
  });

  it('an empty base', async () => {
    const db = await createTestDb();
    expect(await achievementShares(db)).toEqual({ players: 0, holders: {} });
  });

  it('the cache holds for an hour', async () => {
    const db = await createTestDb();
    const [host, a, b] = await makeUsers(db, 3);
    await seedGame(db, { hostId: host!, startedAt: AT, players: [a!, b!].map((id, i) => ({ userId: id, nickname: `P${i}`, score: 1, rank: i + 1 })) });
    const now = 1_000_000;
    expect((await achievementShares(db, now)).holders.first_win).toBeUndefined();
    await db.insert(userAchievement).values({ userId: a!, achievementId: 'first_win', earnedAt: AT });
    expect((await achievementShares(db, now + SHARES_TTL_MS - 1)).holders.first_win).toBeUndefined();
    expect((await achievementShares(db, now + SHARES_TTL_MS + 1)).holders.first_win).toBe(1);
  });

  it('two calls at once share one read', async () => {
    const db = await createTestDb();
    const spy = vi.spyOn(db, 'select');
    await achievementShares(db);
    const single = spy.mock.calls.length;
    forgetAchievementShares();
    spy.mockClear();
    await Promise.all([achievementShares(db), achievementShares(db)]);
    expect(spy.mock.calls.length).toBe(single);
  });

  it('a failure is not cached', async () => {
    const db = await createTestDb();
    const spy = vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    await expect(achievementShares(db)).rejects.toThrow('db down');
    spy.mockRestore();
    expect(await achievementShares(db)).toEqual({ players: 0, holders: {} });
  });
});
