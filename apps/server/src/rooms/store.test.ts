import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { Db } from '../db/client';
import { game, liveRoom, user } from '../db/schema';
import { attachRecorder } from '../recorder';
import { FakeScheduler } from '../testing/fake-scheduler';
import { createTestDb } from '../testing/test-db';
import { LOBBY_TTL_MS, RoomManager, type Identity, type Room, type RoomEvent, type SavedRoom } from './manager';
import { HEARTBEAT_MS, LEASE_MS, MAX_AGE_MS, RoomStore, type RoomStoreOptions } from './store';

const HOST: Identity = { role: 'host', playerId: null };
const correct = { type: 'single', optionId: 'b' } as const;
/** Поля паузи й зв'язку (і «shop.block»: «paused») — єдине, чим відновлений зріз може відрізнятися. */
const steady = (view: unknown) =>
  JSON.parse(
    JSON.stringify(view, (key, value) =>
      ['paused', 'pausedAt', 'endsAt', 'startedAt', 'remainingMs', 'connected', 'serverNow', 'block'].includes(key) ? undefined : value,
    ),
  );

async function world(db?: Db) {
  const base = db ?? (await createTestDb());
  await base.insert(user).values({ id: 'u1', name: 'Ведучий', email: 'h@example.com' }).onConflictDoNothing();
  const scheduler = new FakeScheduler();
  const make = (instanceId: string, options: Partial<RoomStoreOptions> = {}) => {
    const manager = new RoomManager(scheduler, () => 0.5);
    const recorder = attachRecorder(manager, base);
    const store = new RoomStore(base, manager, { instanceId, now: () => scheduler.now(), saveDelayMs: 0, ...options });
    return { manager, recorder, store };
  };
  return { db: base, scheduler, make };
}

/** Гра на першому запитанні: Олена відповіла, Тарас ні. */
function playing(manager: RoomManager, scheduler: FakeScheduler) {
  const room = manager.create(makeQuiz([single, text]), 'u1');
  manager.connect(room, HOST);
  const olena = manager.join(room.code, 'Олена');
  const taras = manager.join(room.code, 'Тарас');
  if (!olena.ok || !taras.ok) throw new Error('join');
  for (const j of [olena, taras]) manager.connect(room, { role: 'player', playerId: j.playerId });
  manager.host(room, { type: 'start' });
  manager.host(room, { type: 'next' });
  scheduler.advance(5000);
  manager.answer(room, olena.playerId, correct);
  return { room, olena, taras };
}

async function rowOf(db: Db, code: string) {
  const [row] = await db.select().from(liveRoom).where(eq(liveRoom.code, code));
  return row;
}

async function statusOf(db: Db, id: string) {
  const [row] = await db.select().from(game).where(eq(game.id, id));
  return row?.status;
}

/**
 * Перехоплює записи live_room: запам'ятовує, скільки гравців ніс кожен, а перший тримає до gate.
 * Решта запитів (історія ігор) іде без змін.
 */
function holdFirstInsert(db: Db, gate: Promise<void>) {
  const original = db.insert.bind(db);
  const seen = { held: false, written: [] as number[] };
  // Обгортаємо ланцюжок insert → values → onConflictDoUpdate → returning лише для live_room.
  const spy = vi.spyOn(db, 'insert') as any;
  spy.mockImplementation((table: any) => {
    const builder = original(table) as any;
    if (table !== liveRoom) return builder;
    const values = builder.values.bind(builder);
    builder.values = (row: { data: SavedRoom }) => {
      const query = values(row);
      const upsert = query.onConflictDoUpdate.bind(query);
      query.onConflictDoUpdate = (config: unknown) => {
        const updating = upsert(config);
        const returning = updating.returning.bind(updating);
        updating.returning = (fields: unknown) => {
          const first = !seen.held;
          seen.held = true;
          return (async () => {
            if (first) await gate;
            const rows = await returning(fields);
            seen.written.push(row.data.state.players.length);
            return rows;
          })();
        };
        return updating;
      };
      return query;
    };
    return builder;
  });
  return seen;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('saving live rooms', () => {
  it('a new manager restores the room: the same views except the pause', async () => {
    const w = await world();
    const a = w.make('a');
    const { room, olena, taras } = playing(a.manager, w.scheduler);
    a.manager.freeze();
    const savedAt = w.scheduler.now();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    expect((await rowOf(w.db, room.code)).owner).toBeNull();

    w.scheduler.advance(10 * 60_000);
    const b = w.make('b');
    expect(await b.store.boot()).toBe(1);
    const back = b.manager.get(room.code) as Room;
    expect(back.state.paused).toBe(true);
    // залишок часу — той, що був у мить запису, а не відновлення
    expect(back.state.remainingMs).toBe(room.state.endsAt! - savedAt);
    for (const who of [
      HOST,
      { role: 'stage', playerId: null },
      { role: 'player', playerId: olena.playerId },
      { role: 'player', playerId: taras.playerId },
    ] as Identity[]) {
      expect(steady(b.manager.view(back, who))).toEqual(steady(a.manager.view(room, who)));
    }
    // підхоплена кімната тепер належить b
    await b.store.idle();
    expect((await rowOf(w.db, room.code)).owner).toBe('b');
    // гра в історії лишається «в процесі»
    await b.recorder.idle();
    expect(await statusOf(w.db, room.id)).toBe('running');
  });

  it('writes at most once a second per room', async () => {
    const w = await world();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const a = w.make('a', { saveDelayMs: 1000 });
    const inserts = vi.spyOn(w.db, 'insert');
    const room = a.manager.create(makeQuiz([single]));
    for (const name of ['Олена', 'Тарас', 'Іра']) expect(a.manager.join(room.code, name).ok).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(await rowOf(w.db, room.code)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await a.store.idle();
    const row = await rowOf(w.db, room.code);
    expect((row.data as SavedRoom).state.players.map((p) => p.nickname)).toEqual(['Олена', 'Тарас', 'Іра']);
    expect(inserts.mock.calls.filter(([table]) => table === liveRoom)).toHaveLength(1);

    // зміна під час запису не губиться: ще один запис після нього
    expect(a.manager.join(room.code, 'Марко').ok).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await a.store.idle();
    expect(((await rowOf(w.db, room.code)).data as SavedRoom).state.players).toHaveLength(4);
    expect(inserts.mock.calls.filter(([table]) => table === liveRoom)).toHaveLength(2);
  });

  it('a change while a write is in flight is written right after it', async () => {
    const w = await world();
    const a = w.make('a');
    // Перший запис live_room тримаємо в польоті, доки тест його не відпустить.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const insert = holdFirstInsert(w.db, gate);
    const room = a.manager.create(makeQuiz([single]));
    expect(a.manager.join(room.code, 'Олена').ok).toBe(true);
    await vi.waitFor(() => expect(insert.held).toBe(true));
    expect(a.manager.join(room.code, 'Тарас').ok).toBe(true);
    release();
    await a.store.idle();
    // перший запис ніс одного гравця; другий, після нього, — обох
    expect(insert.written).toEqual([1, 2]);
    expect(((await rowOf(w.db, room.code)).data as SavedRoom).state.players).toHaveLength(2);
  });

  it('a failing write is reported and does not break the game', async () => {
    const w = await world();
    const errors: unknown[] = [];
    const a = w.make('a', { onError: (error) => errors.push(error) });
    const insert = vi.spyOn(w.db, 'insert').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const room = a.manager.create(makeQuiz([single]));
    expect(a.manager.join(room.code, 'Олена').ok).toBe(true);
    await a.store.idle();
    expect(errors).toHaveLength(1);
    insert.mockRestore();
    expect(a.manager.join(room.code, 'Тарас').ok).toBe(true);
    await a.store.idle();
    expect(((await rowOf(w.db, room.code)).data as SavedRoom).state.players).toHaveLength(2);
  });

  it('deletes the row when the room closes', async () => {
    const w = await world();
    const a = w.make('a');
    const room = a.manager.create(makeQuiz([single]));
    expect(a.manager.join(room.code, 'Олена').ok).toBe(true);
    await a.store.idle();
    expect(await rowOf(w.db, room.code)).toBeDefined();

    w.scheduler.advance(LOBBY_TTL_MS);
    expect(a.manager.get(room.code)).toBeUndefined();
    await a.store.idle();
    expect(await w.db.select().from(liveRoom)).toEqual([]);
  });

  it('release first deletes the row of a closed room whose delete failed, so the next version cannot raise it', async () => {
    const w = await world();
    const errors: unknown[] = [];
    const a = w.make('a', { onError: (error) => errors.push(error) });
    const room = a.manager.create(makeQuiz([single]));
    expect(a.manager.join(room.code, 'Олена').ok).toBe(true);
    await a.store.idle();
    const remove = vi.spyOn(w.db, 'delete').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    w.scheduler.advance(LOBBY_TTL_MS);
    expect(a.manager.get(room.code)).toBeUndefined();
    await a.store.idle();
    expect(errors).toHaveLength(1);
    expect(await rowOf(w.db, room.code)).toBeDefined();
    remove.mockRestore();

    await a.store.flushAll({ release: true });
    a.store.stop();
    expect(await w.db.select().from(liveRoom)).toEqual([]);
    const b = w.make('b');
    expect(await b.store.boot()).toBe(0);
    expect(b.manager.get(room.code)).toBeUndefined();
  });

  it('warns when a saved room is larger than a megabyte', async () => {
    const w = await world();
    const warnings: string[] = [];
    const a = w.make('a', { onWarning: (message) => warnings.push(message) });
    const small = a.manager.create(makeQuiz([single]));
    expect(a.manager.join(small.code, 'Олена').ok).toBe(true);
    await a.store.idle();
    expect(warnings).toEqual([]);
    const quiz = makeQuiz([single]);
    const big = a.manager.create({ ...quiz, title: 'я'.repeat(600_000) });
    expect(a.manager.join(big.code, 'Олена').ok).toBe(true);
    await a.store.idle();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(big.code);
  });

  it('boot drops day-old rooms and aborts their games, and interrupts games without a saved room', async () => {
    const w = await world();
    const a = w.make('a');
    const old = playing(a.manager, w.scheduler).room;
    const unsaved = playing(a.manager, w.scheduler).room;
    const fresh = playing(a.manager, w.scheduler).room;
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    for (const room of [old, unsaved, fresh]) expect(await statusOf(w.db, room.id)).toBe('running');

    await w.db.update(liveRoom).set({ updatedAt: new Date(w.scheduler.now() - MAX_AGE_MS - 1) }).where(eq(liveRoom.code, old.code));
    await w.db.delete(liveRoom).where(eq(liveRoom.code, unsaved.code));

    const b = w.make('b');
    expect(await b.store.boot()).toBe(1);
    expect(await rowOf(w.db, old.code)).toBeUndefined();
    expect(b.manager.get(old.code)).toBeUndefined();
    expect(await statusOf(w.db, old.id)).toBe('aborted');
    expect(await statusOf(w.db, unsaved.id)).toBe('aborted');
    expect(b.manager.get(fresh.code)).toBeDefined();
    await b.recorder.idle();
    expect(await statusOf(w.db, fresh.id)).toBe('running');
  });

  it('a broken or other-version row is dropped and its game aborted', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    const broken = playing(a.manager, w.scheduler).room;
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();
    await w.db.update(liveRoom).set({ data: { ...a.manager.snapshot(room), stateVersion: 999 } }).where(eq(liveRoom.code, room.code));
    await w.db.update(liveRoom).set({ data: 'not a room' }).where(eq(liveRoom.code, broken.code));

    const errors: unknown[] = [];
    const b = w.make('b', { onError: (error) => errors.push(error) });
    expect(await b.store.boot()).toBe(0);
    expect(await w.db.select().from(liveRoom)).toEqual([]);
    expect(await statusOf(w.db, room.id)).toBe('aborted');
    expect(await statusOf(w.db, broken.id)).toBe('aborted');
    expect(errors).toHaveLength(2);
  });
});

describe('the lease', () => {
  it('a room owned by a live instance is not taken', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    await a.store.flushAll(); // owner лишається 'a'
    expect((await rowOf(w.db, room.code)).owner).toBe('a');
    const b = w.make('b');
    const reserved = vi.spyOn(b.manager, 'setReserved');
    expect(await b.store.boot()).toBe(0);
    expect(b.manager.get(room.code)).toBeUndefined();
    expect(await b.store.locate(room.code)).toBe('restarting');
    expect(await b.store.locate('000000')).toBe('none');
    // b не видасть цей код новій кімнаті
    expect([...(reserved.mock.calls.at(-1)?.[0] ?? [])]).toEqual([room.code]);
    // гра кімнати живого процесу не перервана
    await a.recorder.idle();
    expect(await statusOf(w.db, room.id)).toBe('running');
  });

  it('a released or abandoned room is taken', async () => {
    const w = await world();
    const a = w.make('a');
    const released = playing(a.manager, w.scheduler).room;
    const abandoned = playing(a.manager, w.scheduler).room;
    const held = playing(a.manager, w.scheduler).room;
    await a.store.flushAll();
    await w.db.update(liveRoom).set({ owner: null }).where(eq(liveRoom.code, released.code));

    const b = w.make('b');
    // віддану підхоплюють на першому ж підключенні, без очікування tick
    expect(await b.store.locate(released.code)).toBe('here');
    expect(b.manager.get(released.code)).toBeDefined();

    // a тримає оренду серцебиттям: held не підхоплюється й через хвилину
    for (let t = 0; t < 60_000; t += HEARTBEAT_MS) {
      w.scheduler.advance(HEARTBEAT_MS);
      await a.store.tick();
      await a.store.idle();
      // abandoned: a «зависла» для цього рядка — серцебиття йому не оновлюється
      await w.db.update(liveRoom).set({ heartbeatAt: new Date(0) }).where(eq(liveRoom.code, abandoned.code));
      expect(await b.store.locate(held.code)).toBe('restarting');
    }
    await b.store.tick();
    expect(b.manager.get(abandoned.code)).toBeDefined();
    expect(b.manager.get(held.code)).toBeUndefined();
    await b.store.idle();
    expect((await rowOf(w.db, abandoned.code)).owner).toBe('b');
    expect((await rowOf(w.db, held.code)).owner).toBe('a');
  });

  it('a room whose heartbeat stopped is taken after the lease', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    await a.store.flushAll();
    a.manager.freeze(); // процес a упав: ні записів, ні серцебиття
    const b = w.make('b');
    w.scheduler.advance(LEASE_MS);
    await b.store.tick();
    expect(b.manager.get(room.code)).toBeUndefined();
    w.scheduler.advance(1);
    await b.store.tick();
    expect(b.manager.get(room.code)).toBeDefined();
  });

  it('losing the lease evicts the room and its sockets are told to reconnect', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    await a.store.flushAll();
    const events: RoomEvent[] = [];
    a.manager.onEvent((_, event) => events.push(event));

    // a «зависла»: серцебиття не оновлювалося довше за оренду
    await w.db.update(liveRoom).set({ heartbeatAt: new Date(w.scheduler.now() - LEASE_MS - 1) }).where(eq(liveRoom.code, room.code));
    const b = w.make('b');
    await b.store.tick();
    await b.store.idle();
    expect(b.manager.get(room.code)).toBeDefined();
    const taken = (await rowOf(w.db, room.code)).data;

    expect(a.manager.host(room, { type: 'pause' })).toEqual({ ok: true });
    await a.store.idle();
    expect(events.at(-1)).toEqual({ type: 'moved' });
    expect(a.manager.get(room.code)).toBeUndefined();
    const row = await rowOf(w.db, room.code);
    expect(row.owner).toBe('b');
    expect(row.data).toEqual(taken);
  });

  it('two connections at once take the room once', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    a.manager.freeze();
    await a.store.flushAll({ release: true });

    const b = w.make('b');
    const events: RoomEvent[] = [];
    b.manager.onEvent((_, event) => events.push(event));
    const restore = vi.spyOn(b.manager, 'restore');
    expect(await Promise.all([b.store.locate(room.code), b.store.locate(room.code)])).toEqual(['here', 'here']);
    expect(b.manager.size).toBe(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'changed' }]);
  });

  it('release hands every room over and stops writing', async () => {
    const w = await world();
    const a = w.make('a');
    const { room, taras } = playing(a.manager, w.scheduler);
    await a.store.flushAll({ release: true });
    expect((await rowOf(w.db, room.code)).owner).toBeNull();
    // після віддачі кімната вже не наша: зміни не записуються
    expect(a.manager.answer(room, taras.playerId, correct)).toEqual({ ok: true });
    await a.store.idle();
    expect((await rowOf(w.db, room.code)).owner).toBeNull();
    expect(a.manager.get(room.code)).toBe(room);
  });
});

describe('rows and the lease, edge cases', () => {
  it('two processes race for a released row: exactly one takes it', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    a.manager.freeze();
    await a.store.flushAll({ release: true });

    const b = w.make('b');
    const c = w.make('c');
    const [fromB, fromC] = await Promise.all([b.store.locate(room.code), c.store.locate(room.code), b.store.tick(), c.store.tick()]);
    expect([fromB, fromC].sort()).toEqual(['here', 'restarting']);
    const holders = [b, c].filter((p) => p.manager.get(room.code) !== undefined);
    expect(holders).toHaveLength(1);
    await Promise.all([b.store.idle(), c.store.idle()]);
    expect((await rowOf(w.db, room.code)).owner).toBe(holders[0] === b ? 'b' : 'c');
  });

  it('the heartbeat notices a lost lease without waiting for a write', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    await a.store.flushAll();
    const events: RoomEvent[] = [];
    a.manager.onEvent((_, event) => events.push(event));
    await w.db.update(liveRoom).set({ heartbeatAt: new Date(w.scheduler.now() - LEASE_MS - 1) }).where(eq(liveRoom.code, room.code));
    const b = w.make('b');
    await b.store.tick();
    expect(b.manager.get(room.code)).toBeDefined();

    await a.store.tick();
    expect(events).toEqual([{ type: 'moved' }]);
    expect(a.manager.get(room.code)).toBeUndefined();
    expect((await rowOf(w.db, room.code)).owner).toBe('b');
  });

  it('a row taken but not restored is handed back and gets no heartbeat', async () => {
    const w = await world();
    const a = w.make('a');
    const { room } = playing(a.manager, w.scheduler);
    const saved = a.manager.snapshot(room);
    a.manager.freeze();
    await a.store.flushAll({ release: true });

    // у b цей код уже зайнятий іншою кімнатою (збіг кодів), ще не записаною
    const manager = new RoomManager(w.scheduler, () => 0.5);
    const other = manager.restore({ ...saved, id: '00000000-0000-4000-8000-000000000000' });
    expect(other).not.toBeNull();
    const store = new RoomStore(w.db, manager, { instanceId: 'b', now: () => w.scheduler.now(), saveDelayMs: 0 });
    await store.tick();
    expect(manager.get(room.code)).toBe(other);
    expect((await rowOf(w.db, room.code)).owner).toBeNull();
    // серцебиття b цього рядка не тримає: за орендою його може взяти інший процес
    w.scheduler.advance(HEARTBEAT_MS);
    await store.tick();
    expect((await rowOf(w.db, room.code)).owner).toBeNull();

    // restore повертає null (менеджер заморозили, поки чекали на базу) — теж віддаємо
    const c = w.make('c');
    vi.spyOn(c.manager, 'restore').mockReturnValueOnce(null);
    expect(await c.store.locate(room.code)).toBe('restarting');
    expect((await rowOf(w.db, room.code)).owner).toBeNull();
    await c.store.tick(); // тепер піднімає по-справжньому
    expect(c.manager.get(room.code)).toBeDefined();
  });

  it('a restore that throws drops the row and does not stop the boot', async () => {
    const w = await world();
    const a = w.make('a');
    const bad = playing(a.manager, w.scheduler).room;
    const good = playing(a.manager, w.scheduler).room;
    a.manager.freeze();
    await a.store.flushAll({ release: true });
    await a.recorder.idle();

    const errors: unknown[] = [];
    const b = w.make('b', { onError: (error) => errors.push(error) });
    const restore = b.manager.restore.bind(b.manager);
    vi.spyOn(b.manager, 'restore').mockImplementation((saved) => {
      if (saved.code === bad.code) throw new Error('boom');
      return restore(saved);
    });
    expect(await b.store.boot()).toBe(1);
    expect(errors).toHaveLength(1);
    expect(await rowOf(w.db, bad.code)).toBeUndefined();
    expect(await statusOf(w.db, bad.id)).toBe('aborted');
    expect(b.manager.get(good.code)).toBeDefined();
  });

  it('the lease runs on the database clock when no clock is given', async () => {
    const w = await world();
    const a = w.make('a', { now: undefined });
    const { room } = playing(a.manager, w.scheduler);
    await a.store.flushAll();
    const b = w.make('b', { now: undefined });
    expect(await b.store.boot()).toBe(0);
    expect(await b.store.locate(room.code)).toBe('restarting');
    await a.store.tick();
    expect(await b.store.locate(room.code)).toBe('restarting');
    // a зникла без віддачі: серцебиття старше за оренду за годинником бази
    await w.db.execute(sql`update live_room set heartbeat_at = now() - interval '21 seconds'`);
    expect(await b.store.locate(room.code)).toBe('here');
    await b.store.idle();
    expect((await rowOf(w.db, room.code)).owner).toBe('b');
  });
});
