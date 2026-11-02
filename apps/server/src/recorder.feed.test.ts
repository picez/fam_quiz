import { randomUUID } from 'node:crypto';
import { levelOf, xpForLevel } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, withId } from '@quiz/engine/testing';
import type { Db } from './db/client';
import { feedEvent, user, xpEntry } from './db/schema';
import * as feed from './feed-publish';
import { attachRecorder } from './recorder';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';
import { xpTotals } from './xp-store';

vi.mock('./feed-publish', async (importOriginal) => {
  const original = await importOriginal<typeof import('./feed-publish')>();
  return { ...original, publishGameFeed: vi.fn(original.publishGameFeed) };
});

afterEach(() => {
  vi.mocked(feed.publishGameFeed).mockClear();
});

const HOST = 'f-host';
const USERS = { Оля: 'f-olia', Петро: 'f-petro' } as const;
const right = { type: 'single', optionId: 'b' } as const;

async function world(existing?: Db) {
  const db = existing ?? (await createTestDb());
  if (existing === undefined) await db.insert(user).values([
    { id: HOST, name: 'Ведуча', email: 'host@example.com' },
    ...Object.entries(USERS).map(([name, id]) => ({ id, name, email: `${id}@example.com` })),
  ]);
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error), 1);
  return { db, scheduler, manager, recorder, errors };
}

type World = Awaited<ReturnType<typeof world>>;

function lobby(w: World) {
  const questions = [1, 2, 3].map((n) => withId(single, `q${n}`));
  const room = w.manager.create(makeQuiz(questions, { speedBonus: false }), HOST, null);
  w.manager.connect(room, { role: 'host', playerId: null });
  const ids = Object.entries(USERS).map(([nickname, userId]) => {
    const joined = w.manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    w.manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  });
  return { room, ids };
}

function playAll(w: World, g: { room: Room; ids: string[] }) {
  expect(w.manager.host(g.room, { type: 'start' })).toEqual({ ok: true });
  for (let guard = 0; guard < 80 && g.room.state.phase !== 'finished'; guard++) {
    if (g.room.state.phase === 'question') {
      w.manager.answer(g.room, g.ids[0], right);
      w.manager.host(g.room, { type: 'lock' });
    } else w.manager.host(g.room, { type: 'next' });
  }
  expect(g.room.state.phase).toBe('finished');
}

const rowsOf = (w: World, room: Room) => w.db.select().from(feedEvent).where(eq(feedEvent.gameId, room.id));
const kinds = async (w: World, room: Room, kind: string) => (await rowsOf(w, room)).filter((r) => r.kind === kind);

/** Скільки акаунтів гри (гравці й ведуча) мають рівень вище за 1: стільки має бути подій level. */
async function levelled(w: World) {
  const totals = await xpTotals(w.db, [HOST, ...Object.values(USERS)]);
  return [...totals.values()].filter((xp) => levelOf(xp) > 1).length;
}

describe('the feed in the recorder', () => {
  it('a finished game gives a game event to each account of the table', async () => {
    const w = await world();
    const g = lobby(w);
    playAll(w, g);
    await w.recorder.idle();
    expect(w.errors).toEqual([]);
    const games = await kinds(w, g.room, 'game');
    expect(games.map((r) => r.userId).sort()).toEqual(Object.values(USERS).sort());
    expect(vi.mocked(feed.publishGameFeed)).toHaveBeenCalledTimes(1);
  });

  it('a failure after the game events is retried: no duplicate game events, one level event (Review Focus 1)', async () => {
    const w = await world();
    // Оля вже майже на рівні 3: гра її піднімає.
    await w.db.insert(xpEntry).values({ userId: USERS.Оля, source: 'game', gameId: randomUUID(), amount: xpForLevel(3) - 1, day: '2026-10-30', at: new Date(), createdAt: new Date() });
    const g = lobby(w);
    vi.mocked(feed.publishGameFeed).mockImplementationOnce(async (db, gameId) => {
      await feed.writeGameEvents(db, { gameId }, false);
      throw new Error('db down');
    });
    playAll(w, g);
    await w.recorder.idle();
    await vi.waitFor(async () => expect(await kinds(w, g.room, 'level')).not.toHaveLength(0));
    await w.recorder.idle();
    expect(w.errors).toHaveLength(1);
    expect(await kinds(w, g.room, 'game')).toHaveLength(2);
    const levels = await kinds(w, g.room, 'level');
    expect(levels.filter((r) => r.userId === USERS.Оля)).toHaveLength(1);
    expect(levels).toHaveLength(await levelled(w));
  });

  it('a room picked up again in finished writes nothing new', async () => {
    const w = await world();
    const g = lobby(w);
    playAll(w, g);
    await w.recorder.idle();
    const before = await rowsOf(w, g.room);
    expect(before.length).toBeGreaterThanOrEqual(2);

    // Перезапуск: новий менеджер і рекордер над тією самою базою піднімають кімнату в finished.
    const next = await world(w.db);
    expect(next.manager.restore(w.manager.snapshot(g.room))).not.toBeNull();
    await next.recorder.idle();
    expect(next.errors).toEqual([]);
    expect(vi.mocked(feed.publishGameFeed)).toHaveBeenCalledTimes(2);
    expect(await rowsOf(w, g.room)).toHaveLength(before.length);
  });
});
