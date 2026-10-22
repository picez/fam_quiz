import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { user } from './db/schema';
import { seedGame, type SeedPlayer } from './testing/history-rows';
import { createTestDb } from './testing/test-db';
import { versusOf } from './versus';

let db: Db;
const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const newUsers = async (count: number): Promise<string[]> => {
  const ids = Array.from({ length: count }, () => randomUUID());
  await db.insert(user).values(ids.map((id) => ({ id, name: 'Гравець', email: `${id}@example.com` })));
  return ids;
};
const both = (correct: number): SeedPlayer['rows'] => Array.from({ length: correct }, (_, i) => ({ questionIndex: i, accepted: true, points: 10 }));

beforeAll(async () => {
  db = await createTestDb();
});

describe('versusOf', () => {
  it('counts shared finished games, who placed higher, accuracy and the latest games', async () => {
    const [host, me, him] = (await newUsers(3)) as [string, string, string];
    const play = (startedAt: Date, title: string, status: 'finished' | 'aborted', players: SeedPlayer[]) =>
      seedGame(db, { hostId: host, startedAt, title, status, questionsPlayed: 2, players });
    const g1 = await play(day(1), 'Перша', 'finished', [
      { userId: me, nickname: 'Я', score: 20, rank: 1, rows: both(2) },
      { userId: him, nickname: 'Він', score: 10, rank: 2, rows: both(2) },
    ]);
    const g2 = await play(day(2), 'Друга', 'finished', [
      { userId: me, nickname: 'Я', score: 0, rank: 3 },
      { userId: him, nickname: 'Він', score: 30, rank: 1, rows: both(2) },
    ]);
    await play(day(3), 'Перервана', 'aborted', [
      { userId: me, nickname: 'Я', score: 0, rank: null },
      { userId: him, nickname: 'Він', score: 0, rank: null },
    ]);
    await play(day(4), 'Лише він', 'finished', [{ userId: him, nickname: 'Він', score: 5, rank: 1 }]);
    await play(day(5), 'Лише я', 'finished', [{ userId: me, nickname: 'Я', score: 5, rank: 1 }]);

    expect(await versusOf(db, me, him)).toEqual({
      together: 2,
      myAhead: 1,
      theirAhead: 1,
      myAccuracy: 50,
      theirAccuracy: 100,
      recent: [
        { gameId: g2.gameId, title: 'Друга', startedAt: expect.any(String), myRank: 3, theirRank: 1 },
        { gameId: g1.gameId, title: 'Перша', startedAt: expect.any(String), myRank: 1, theirRank: 2 },
      ],
    });
  });

  it('a doubled participant counts once and a tie goes to nobody', async () => {
    const [host, me, him] = (await newUsers(3)) as [string, string, string];
    await seedGame(db, {
      hostId: host,
      startedAt: day(1),
      questionsPlayed: 2,
      players: [
        { userId: me, nickname: 'Я1', score: 5, rank: 2, rows: both(1) },
        { userId: me, nickname: 'Я2', score: 1, rank: 4 },
        { userId: him, nickname: 'Він', score: 5, rank: 2, rows: both(2) },
      ],
    });
    expect(await versusOf(db, me, him)).toMatchObject({ together: 1, myAhead: 0, theirAhead: 0, myAccuracy: 50, theirAccuracy: 100 });
  });

  it('keeps only the latest five shared games', async () => {
    const [host, me, him] = (await newUsers(3)) as [string, string, string];
    for (let n = 1; n <= 7; n += 1) {
      await seedGame(db, {
        hostId: host,
        startedAt: day(n),
        title: `Гра ${n}`,
        players: [
          { userId: me, nickname: 'Я', score: 1, rank: 1 },
          { userId: him, nickname: 'Він', score: 0, rank: 2 },
        ],
      });
    }
    const v = await versusOf(db, me, him);
    expect(v.together).toBe(7);
    expect(v.recent.map((g) => g.title)).toEqual(['Гра 7', 'Гра 6', 'Гра 5', 'Гра 4', 'Гра 3']);
  });
});
