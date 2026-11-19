import { randomUUID } from 'node:crypto';
import { makeQuiz, single } from '@quiz/engine/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminCharts, kyivDayList, shiftDay, weeklyReturns } from './admin-charts';
import type { Db } from './db/client';
import { game, participant, user } from './db/schema';
import { createTestDb } from './testing/test-db';

const sets = (...ids: string[]) => new Set(ids);

describe('chart days', () => {
  it('lists 30 Kyiv days, oldest first', () => {
    const days = kyivDayList(new Date('2026-11-19T10:00:00Z'), 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-10-21');
    expect(days[29]).toBe('2026-11-19');
  });

  it('shifts calendar days across a clock change and a month edge', () => {
    expect(shiftDay('2026-10-26', -1)).toBe('2026-10-25');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts week-over-week returns', () => {
    const byDay = new Map<string, ReadonlySet<string>>([
      ['2026-11-10', sets('a', 'b', 'c')],
      ['2026-11-12', sets('d')],
      ['2026-11-18', sets('a', 'b', 'e')],
    ]);
    expect(weeklyReturns(byDay, '2026-11-19')).toBe(50);
    expect(weeklyReturns(new Map([['2026-11-18', sets('a')]]), '2026-11-19')).toBeNull();
  });
});

describe('adminCharts', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  const now = new Date('2026-11-19T10:00:00Z');

  it('on an empty database gives 30 days of zeros with no shares', async () => {
    const charts = await adminCharts(db, now);
    expect(charts.computedAt).toBe(now.toISOString());
    expect(charts.days).toHaveLength(30);
    expect(charts.days.every((d) => d.players === 0 && d.games === 0 && d.finished === 0 && d.completion === null && d.returns === null)).toBe(true);
  });

  it('counts accounts, games and finished games by the Kyiv day', async () => {
    const ids = ['ch1', 'ch2', 'ch3'];
    for (const id of ids) await db.insert(user).values({ id, name: id, email: `${id}@example.com`, emailVerified: false, createdAt: now });
    let code = 100000;
    async function play(startedAt: string, status: 'finished' | 'aborted', who: string[], guests = 0) {
      const id = randomUUID();
      await db.insert(game).values({ id, quizId: null, hostId: 'ch3', code: String((code += 1)), status, title: 't', quizSnapshot: makeQuiz([single]), startedAt: new Date(startedAt) });
      for (const userId of who) await db.insert(participant).values({ id: randomUUID(), gameId: id, nickname: userId, userId, score: 0, totalTimeMs: 0 });
      for (let i = 0; i < guests; i += 1) await db.insert(participant).values({ id: randomUUID(), gameId: id, nickname: `g${i}`, userId: null, score: 0, totalTimeMs: 0 });
    }
    // 23:30 за Києвом 19.11 = 21:30 UTC 19.11 (взимку UTC+2)
    await play('2026-11-19T21:30:00Z', 'finished', ['ch1', 'ch2'], 1);
    await play('2026-11-19T08:00:00Z', 'aborted', ['ch1']);
    // тиждень тому: 8–14 днів тому для ch1, ch2
    await play('2026-11-08T10:00:00Z', 'finished', ['ch1', 'ch2']);
    const today = (await adminCharts(db, now)).days.at(-1)!;
    expect(today).toMatchObject({ day: '2026-11-19', players: 2, games: 2, finished: 1, completion: 50, returns: 100 });
    await play('2026-11-09T10:00:00Z', 'finished', ['ch3']);
    expect((await adminCharts(db, now)).days.at(-1)!.returns).toBe(67);
  });
});
