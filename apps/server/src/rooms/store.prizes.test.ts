import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { PrizeContent } from '@quiz/shared';
import type { Db } from '../db/client';
import { game, liveRoom, prize, user } from '../db/schema';
import { createPrize, releaseStalePrizes, reservePlaces } from '../prizes';
import { attachRecorder } from '../recorder';
import { FakeScheduler } from '../testing/fake-scheduler';
import { createTestDb } from '../testing/test-db';
import { RoomManager, type Identity, type Room } from './manager';
import { MAX_AGE_MS, RoomStore, type RoomStoreOptions } from './store';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
const content = (name: string): PrizeContent => ({ name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false });

async function world() {
  const db = await createTestDb();
  await db.insert(user).values({ id: 'u1', name: 'Ведучий', email: 'h@example.com' });
  const scheduler = new FakeScheduler();
  const make = (instanceId: string, options: Partial<RoomStoreOptions> = {}) => {
    const manager = new RoomManager(scheduler, () => 0.5);
    const recorder = attachRecorder(manager, db);
    const store = new RoomStore(db, manager, { instanceId, now: () => scheduler.now(), saveDelayMs: 0, ...options });
    return { manager, recorder, store };
  };
  return { db, scheduler, make };
}

async function prizeFor(db: Db, gameId: string, name: string): Promise<string> {
  const made = await createPrize(db, 'u1', content(name));
  if (!made.ok) throw new Error(made.error);
  const reserved = await reservePlaces(db, 'u1', gameId, [made.prize.id, null, null]);
  if (!reserved.ok) throw new Error(reserved.error);
  return made.prize.id;
}

/** Лобі з призом на 1-му місці. */
async function lobbyWithPrize(db: Db, manager: RoomManager, name: string): Promise<{ room: Room; id: string }> {
  const room = manager.create(makeQuiz([single, text], { speedBonus: false }), 'u1');
  manager.connect(room, HOST);
  const id = await prizeFor(db, room.id, name);
  const reserved = await reservePlaces(db, 'u1', room.id, [id, null, null]);
  if (!reserved.ok) throw new Error(reserved.error);
  manager.setPrizes(room, reserved.placed);
  return { room, id };
}

/** Перше запитання зіграно; гра на таблиці (контрольна точка). */
function toLeaderboard(manager: RoomManager, scheduler: FakeScheduler, room: Room) {
  const olena = manager.join(room.code, 'Олена');
  if (!olena.ok) throw new Error('join');
  manager.connect(room, { role: 'player', playerId: olena.playerId });
  manager.host(room, { type: 'start' });
  manager.host(room, { type: 'next' });
  scheduler.advance(5000);
  manager.answer(room, olena.playerId, correct);
  for (let step = 0; step < 4 && room.state.phase !== 'leaderboard'; step += 1) manager.host(room, { type: 'next' });
  expect(room.state.phase).toBe('leaderboard');
}

const statusOf = async (db: Db, id: string) => (await db.select().from(prize).where(eq(prize.id, id)))[0]?.status;

describe('prizes across a server start', () => {
  it('boot frees a reservation of a game without a live room and keeps the one of a room that comes back', async () => {
    const w = await world();
    const a = w.make('a');
    const kept = await lobbyWithPrize(w.db, a.manager, 'Кубок');
    const lost = await prizeFor(w.db, randomUUID(), 'Медаль');
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();

    const b = w.make('b');
    expect(await b.store.boot()).toBe(1);
    expect(b.manager.get(kept.room.code)?.prizes.map((p) => p.id)).toEqual([kept.id]);
    expect(await statusOf(w.db, kept.id)).toBe('reserved');
    expect(await statusOf(w.db, lost)).toBe('free');
  });

  it('boot keeps the reservation of a saved game', async () => {
    const w = await world();
    const a = w.make('a');
    const g = await lobbyWithPrize(w.db, a.manager, 'Кубок');
    toLeaderboard(a.manager, w.scheduler, g.room);
    expect(a.manager.save(g.room)).toEqual({ ok: true });
    await a.recorder.idle();
    await a.store.idle();
    expect(await w.db.select().from(liveRoom)).toEqual([]);

    const b = w.make('b');
    await b.store.boot();
    expect(await statusOf(w.db, g.id)).toBe('reserved');
  });

  it('the sweeper keeps a saved game and frees an aborted one', async () => {
    const w = await world();
    const saved = randomUUID();
    const aborted = randomUUID();
    for (const [id, status] of [[saved, 'saved'], [aborted, 'aborted']] as const) {
      await w.db.insert(game).values({ id, hostId: 'u1', code: '123456', title: 'Україна', quizSnapshot: {}, startedAt: new Date(), status, questionsPlayed: 1, plays: [] });
    }
    const keep = await prizeFor(w.db, saved, 'Кубок');
    const free = await prizeFor(w.db, aborted, 'Медаль');
    expect(await releaseStalePrizes(w.db, [])).toBe(1);
    expect(await statusOf(w.db, keep)).toBe('reserved');
    expect(await statusOf(w.db, free)).toBe('free');
  });

  it('the day-old purge of a lobby gives its prize back', async () => {
    const w = await world();
    const a = w.make('a');
    const g = await lobbyWithPrize(w.db, a.manager, 'Кубок');
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    await w.db.update(liveRoom).set({ updatedAt: new Date(w.scheduler.now() - MAX_AGE_MS - 1) }).where(eq(liveRoom.code, g.room.code));

    const b = w.make('b');
    await b.store.tick();
    expect(await w.db.select().from(liveRoom)).toEqual([]);
    expect(await statusOf(w.db, g.id)).toBe('free');
  });

  it('the day-old purge of a game in play saves it and keeps its prize reserved', async () => {
    const w = await world();
    const a = w.make('a');
    const g = await lobbyWithPrize(w.db, a.manager, 'Кубок');
    toLeaderboard(a.manager, w.scheduler, g.room);
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    await w.db.update(liveRoom).set({ updatedAt: new Date(w.scheduler.now() - MAX_AGE_MS - 1) }).where(eq(liveRoom.code, g.room.code));

    const b = w.make('b');
    await b.store.tick();
    const [row] = await w.db.select().from(game).where(eq(game.id, g.room.id));
    expect(row?.status).toBe('saved');
    expect(await statusOf(w.db, g.id)).toBe('reserved');
  });
});
