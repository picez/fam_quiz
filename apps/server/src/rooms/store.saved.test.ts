import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { GAME_STATE_VERSION } from '@quiz/engine';
import { bool, makeQuiz, multi, single, text } from '@quiz/engine/testing';
import type { Db } from '../db/client';
import { game, liveRoom, savedGame, user } from '../db/schema';
import { attachRecorder } from '../recorder';
import { FakeScheduler } from '../testing/fake-scheduler';
import { createTestDb } from '../testing/test-db';
import { RoomManager, type Identity } from './manager';
import { MAX_AGE_MS, RoomStore, type RoomStoreOptions } from './store';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;

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

/** Гра з played закритими запитаннями; далі — на таблиці після останнього закритого (stay) або на наступному запитанні. */
function playing(manager: RoomManager, scheduler: FakeScheduler, played: number, stay = false) {
  const room = manager.create(makeQuiz([single, text, bool, multi], { speedBonus: false }), 'u1');
  manager.connect(room, HOST);
  const olena = manager.join(room.code, 'Олена');
  if (!olena.ok) throw new Error('join');
  manager.connect(room, { role: 'player', playerId: olena.playerId });
  manager.host(room, { type: 'start' });
  for (let i = 0; i < played; i += 1) {
    manager.host(room, { type: 'next' });
    scheduler.advance(5000);
    manager.answer(room, olena.playerId, i % 2 === 0 ? correct : { type: 'text', value: 'Київ' });
    // Одна гравчиня відповіла — запитання могло закритись само: далі до таблиці.
    for (let step = 0; step < 3 && room.state.phase !== 'leaderboard'; step += 1) manager.host(room, { type: 'next' });
  }
  if (played > 0) expect(room.state.phase).toBe('leaderboard');
  if (!stay) {
    manager.host(room, { type: 'next' });
    expect(room.state.phase).toBe('question');
  }
  return room;
}

async function statusOf(db: Db, id: string) {
  const [row] = await db.select().from(game).where(eq(game.id, id));
  return row?.status;
}

async function savedOf(db: Db, id: string) {
  const [row] = await db.select().from(savedGame).where(eq(savedGame.gameId, id));
  return row;
}

describe('a game that loses its room', () => {
  it('the day-old purge saves the checkpoint of the room', async () => {
    const w = await world();
    const a = w.make('a');
    const room = playing(a.manager, w.scheduler, 1);
    expect(room.checkpoint?.state.phase).toBe('leaderboard');
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    await w.db.update(liveRoom).set({ updatedAt: new Date(w.scheduler.now() - MAX_AGE_MS - 1) }).where(eq(liveRoom.code, room.code));

    const b = w.make('b');
    await b.store.tick();
    expect(await w.db.select().from(liveRoom)).toEqual([]);
    expect(await statusOf(w.db, room.id)).toBe('saved');
    const saved = await savedOf(w.db, room.id);
    expect((saved?.data as { state: { phase: string } }).state.phase).toBe('leaderboard');
    expect(saved?.stateVersion).toBe(GAME_STATE_VERSION);
  });

  it('an unreadable record of a game with closed questions is saved from the recorded rows', async () => {
    const w = await world();
    const a = w.make('a');
    const room = playing(a.manager, w.scheduler, 2);
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    await w.db.update(liveRoom).set({ data: { ...a.manager.snapshot(room), stateVersion: 999 } }).where(eq(liveRoom.code, room.code));

    const errors: unknown[] = [];
    const b = w.make('b', { onError: (error) => errors.push(error) });
    expect(await b.store.boot()).toBe(0);
    expect(await w.db.select().from(liveRoom)).toEqual([]);
    expect(await statusOf(w.db, room.id)).toBe('saved');
    const saved = await savedOf(w.db, room.id);
    expect(saved?.stateVersion).toBe(999);
    expect((saved?.data as { state: { phase: string } }).state.phase).toBe('leaderboard');
    expect(errors).toHaveLength(1);
  });

  it('an unreadable record of a game without a closed question is aborted', async () => {
    const w = await world();
    const a = w.make('a');
    const room = playing(a.manager, w.scheduler, 0);
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    await w.db.update(liveRoom).set({ data: 'not a room' }).where(eq(liveRoom.code, room.code));

    const b = w.make('b', { onError: () => {} });
    await b.store.boot();
    expect(await statusOf(w.db, room.id)).toBe('aborted');
    expect(await savedOf(w.db, room.id)).toBeUndefined();
  });

  it('a server start parks running games with closed questions as saved and aborts the rest; a kept room stays running', async () => {
    const w = await world();
    const a = w.make('a');
    const two = playing(a.manager, w.scheduler, 2);
    const none = playing(a.manager, w.scheduler, 0);
    const kept = playing(a.manager, w.scheduler, 2);
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    const [row] = await w.db.select().from(game).where(eq(game.id, two.id));
    expect(row?.questionsPlayed).toBe(2);
    await w.db.delete(liveRoom).where(eq(liveRoom.code, two.code));
    await w.db.delete(liveRoom).where(eq(liveRoom.code, none.code));

    const b = w.make('b');
    expect(await b.store.boot()).toBe(1);
    expect(await statusOf(w.db, two.id)).toBe('saved');
    const saved = await savedOf(w.db, two.id);
    expect(saved).toBeDefined();
    expect(saved?.data).toBeNull();
    expect(saved?.stateVersion).toBeNull();
    expect(await statusOf(w.db, none.id)).toBe('aborted');
    expect(await savedOf(w.db, none.id)).toBeUndefined();
    expect(b.manager.get(kept.code)).toBeDefined();
    await b.recorder.idle();
    expect(await statusOf(w.db, kept.id)).toBe('running');
    expect(await savedOf(w.db, kept.id)).toBeUndefined();
  });

  it('a saved game has no expiry: a month-old one survives the purge', async () => {
    const w = await world();
    const a = w.make('a');
    const room = playing(a.manager, w.scheduler, 1, true);
    expect(a.manager.save(room)).toEqual({ ok: true });
    await a.recorder.idle();
    await a.store.idle();
    const month = new Date(w.scheduler.now() - 30 * 24 * 60 * 60_000);
    await w.db.update(savedGame).set({ savedAt: month }).where(eq(savedGame.gameId, room.id));

    const b = w.make('b');
    await b.store.tick();
    expect(await statusOf(w.db, room.id)).toBe('saved');
    expect((await savedOf(w.db, room.id))?.savedAt).toEqual(month);
  });
});
