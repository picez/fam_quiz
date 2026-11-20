import { GAME_STATE_VERSION } from '@quiz/engine';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { DELETED_NICKNAME } from '@quiz/shared';
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { gameEvent, user } from './db/schema';
import { attachRecorder, trimToCheckpoint } from './recorder';
import type { SavedGameData } from './rooms/continuation';
import { RoomManager, type Room } from './rooms/manager';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

const HOST = 'host-user';
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(retryMs = 5000) {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: HOST, name: 'Ведуча', email: 'host@example.com' },
    { id: 'olia-user', name: 'Оля', email: 'olia@example.com' },
  ]);
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const errors: unknown[] = [];
  const recorder = attachRecorder(manager, db, (error) => errors.push(error), retryMs);
  const saves: SavedGameData[] = [];
  manager.onEvent((_room, event) => {
    if (event.type === 'closed' && event.saved !== undefined) saves.push(event.saved);
  });
  const room = manager.create(makeQuiz([single, text, single], { speedBonus: false }), HOST, null);
  const enterIn = (target: Room, nickname: string, userId: string | null = null) => {
    const joined = manager.join(target.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(target, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const enter = (nickname: string, userId: string | null = null) => {
    const joined = manager.join(room.code, nickname, userId);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    return joined.playerId;
  };
  const olia = enter('Оля', 'olia-user');
  const petro = enter('Петро');
  const host = (command: Parameters<RoomManager['host']>[1], target: Room = room) => expect(manager.host(target, command)).toEqual({ ok: true });
  /** Крок годинника: події мають різні миті. */
  const tick = () => scheduler.advance(100);
  const events = async () => {
    await recorder.idle();
    return db.select().from(gameEvent).where(eq(gameEvent.gameId, room.id)).orderBy(asc(gameEvent.at));
  };
  /** Запитання 1 зіграно, таблиця, «Зберегти» і точне продовження (13b): нова кімната з тим самим id, на паузі. */
  const continued = async (): Promise<Room> => {
    host({ type: 'start' });
    tick();
    host({ type: 'next' });
    manager.answer(room, olia, correct);
    manager.answer(room, petro, wrong);
    host({ type: 'next' });
    host({ type: 'next' });
    expect(room.state.phase).toBe('leaderboard');
    scheduler.advance(60_000);
    // Записи йдуть між діями ведучого; не записане до «Зберегти» збереження відкидає.
    await recorder.idle();
    host({ type: 'save' });
    scheduler.advance(60_000);
    const result = manager.continueSaved(room.id, HOST, JSON.parse(JSON.stringify(saves.at(-1))) as SavedGameData);
    if (!result.ok) throw new Error(result.error);
    return result.room;
  };
  return { db, scheduler, manager, recorder, room, enter, enterIn, olia, petro, host, tick, events, errors, continued };
}

/** Перше запитання відкрито: Оля правильно, Петро ні; запитання закривається само. */
function firstQuestion(ctx: Awaited<ReturnType<typeof setup>>) {
  ctx.host({ type: 'start' });
  ctx.tick();
  ctx.host({ type: 'next' });
  expect(ctx.room.state.phase).toBe('question');
}

describe('recorder: game events (65)', () => {
  it('a game records start, a late join, a pause, a manual decision and a kick', async () => {
    const ctx = await setup();
    // Новенький приходить між запитаннями продовженої гри (13b, addLatePlayer).
    const room = await ctx.continued();
    ctx.tick();
    const marko = ctx.enterIn(room, 'Марко');
    ctx.tick();
    ctx.host({ type: 'resume' }, room);
    ctx.tick();
    ctx.host({ type: 'next' }, room);
    expect(room.state.phase).toBe('question');
    ctx.tick();
    ctx.host({ type: 'pause' }, room);
    ctx.tick();
    ctx.host({ type: 'resume' }, room);
    ctx.tick();
    ctx.manager.answer(room, ctx.olia, { type: 'text', value: 'Одеса' });
    ctx.manager.answer(room, ctx.petro, { type: 'text', value: 'Львів' });
    ctx.manager.answer(room, marko, { type: 'text', value: 'Одеса' });
    ctx.host({ type: 'next' }, room);
    expect(room.state.phase).toBe('reveal');
    ctx.tick();
    ctx.host({ type: 'override', playerId: ctx.petro, grade: 'correct' }, room);
    ctx.tick();
    const markoScore = room.state.players.find((p) => p.id === marko)!.score;
    expect(markoScore).toBeGreaterThan(0);
    ctx.host({ type: 'kick', playerId: marko }, room);
    ctx.tick();
    ctx.host({ type: 'end' }, room);
    expect(room.state.phase).toBe('finished');

    const rows = await ctx.events();
    expect(rows.map((r) => [r.kind, r.nickname, r.questionIndex])).toEqual([
      ['start', '', -1],
      ['join', 'Марко', 0],
      // Продовження відкривається на паузі (мить контрольної точки).
      ['resume', '', 0],
      ['pause', '', 1],
      ['resume', '', 1],
      ['verdict', 'Петро', 1],
      ['leave', 'Марко', 1],
    ]);
    expect(rows.find((r) => r.kind === 'verdict')).toMatchObject({ participantId: ctx.petro, details: { from: 'wrong', to: 'correct' } });
    expect(rows.find((r) => r.kind === 'leave')).toMatchObject({ participantId: marko, userId: null, details: { score: markoScore } });
    expect(rows.filter((r) => r.kind === 'start')).toHaveLength(1);
    expect(ctx.errors).toEqual([]);
  });

  it('a join with an account keeps the account', async () => {
    const ctx = await setup();
    await ctx.db.insert(user).values({ id: 'marko-user', name: 'Марко', email: 'marko@example.com' });
    const room = await ctx.continued();
    ctx.tick();
    ctx.enterIn(room, 'Марко', 'marko-user');
    expect((await ctx.events()).find((r) => r.kind === 'join')).toMatchObject({ userId: 'marko-user', nickname: 'Марко', questionIndex: 0 });
    expect(ctx.errors).toEqual([]);
  });

  it('an account deleted while its event waits does not block later writes and becomes the deleted player', async () => {
    const ctx = await setup();
    await ctx.db.insert(user).values({ id: 'marko-user', name: 'Марко', email: 'marko@example.com' });
    const room = await ctx.continued();
    await ctx.recorder.idle();
    // Запис із приєднанням Марка не вдається: подія лишається в черзі.
    vi.spyOn(ctx.db, 'transaction').mockRejectedValueOnce(new Error('database is down'));
    ctx.tick();
    ctx.enterIn(room, 'Марко', 'marko-user');
    await ctx.recorder.idle();
    expect(ctx.errors).toHaveLength(1);
    // Видалення акаунта (admin-card-routes): спершу кімнати, потім рядок user.
    ctx.manager.forgetUser('marko-user');
    await ctx.db.delete(user).where(eq(user.id, 'marko-user'));
    ctx.tick();
    ctx.host({ type: 'resume' }, room);
    const rows = await ctx.events();
    expect(ctx.errors).toHaveLength(1);
    expect(rows.find((r) => r.kind === 'join')).toMatchObject({ userId: null, nickname: DELETED_NICKNAME });
    expect(rows.map((r) => r.kind)).toEqual(['start', 'join', 'resume']);
  });

  it('a pause alone is written', async () => {
    const ctx = await setup();
    firstQuestion(ctx);
    await ctx.recorder.idle();
    ctx.tick();
    ctx.host({ type: 'pause' });
    expect((await ctx.events()).map((r) => r.kind)).toEqual(['start', 'pause']);
    expect(ctx.errors).toEqual([]);
  });

  it('a failed write retries without duplicates', async () => {
    const ctx = await setup(10);
    firstQuestion(ctx);
    await ctx.recorder.idle();
    // Запис дійшов до бази, а відповідь загубилась: черга вважає його невдалим і пише ще раз.
    const original = ctx.db.transaction.bind(ctx.db);
    const lost = vi.spyOn(ctx.db, 'transaction').mockImplementationOnce((async (fn: Parameters<Db['transaction']>[0]) => {
      await original(fn);
      throw new Error('connection lost after commit');
    }) as Db['transaction']);
    ctx.tick();
    ctx.host({ type: 'pause' });
    await ctx.recorder.idle();
    expect(ctx.errors).toHaveLength(1);
    lost.mockRestore();
    await wait(80);
    await ctx.recorder.idle();
    const rows = await ctx.events();
    expect(rows.map((r) => r.kind)).toEqual(['start', 'pause']);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('a failed write keeps its events for the next one', async () => {
    const ctx = await setup();
    firstQuestion(ctx);
    await ctx.recorder.idle();
    vi.spyOn(ctx.db, 'transaction').mockRejectedValueOnce(new Error('database is down'));
    ctx.tick();
    ctx.host({ type: 'pause' });
    await ctx.recorder.idle();
    expect(ctx.errors).toHaveLength(1);
    ctx.tick();
    ctx.host({ type: 'resume' });
    expect((await ctx.events()).map((r) => r.kind)).toEqual(['start', 'pause', 'resume']);
  });

  it('a room raised after a restart adds no joins and no second start', async () => {
    const ctx = await setup();
    firstQuestion(ctx);
    ctx.manager.answer(ctx.room, ctx.olia, correct);
    ctx.manager.answer(ctx.room, ctx.petro, wrong);
    ctx.host({ type: 'next' });
    const before = await ctx.events();
    expect(before.map((r) => r.kind)).toEqual(['start']);

    // Новий процес: свіжий менеджер і записувач над тією самою базою.
    const saved = JSON.parse(JSON.stringify(ctx.manager.snapshot(ctx.room)));
    ctx.manager.freeze();
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const errors: unknown[] = [];
    const recorder = attachRecorder(manager, ctx.db, (error) => errors.push(error));
    const raised: Room | null = manager.restore(saved);
    expect(raised).not.toBeNull();
    await recorder.idle();
    // Піднята кімната стоїть на паузі з миті знімка.
    scheduler.advance(100);
    expect(manager.host(raised!, { type: 'resume' })).toEqual({ ok: true });
    scheduler.advance(100);
    expect(manager.host(raised!, { type: 'next' })).toEqual({ ok: true });
    await recorder.idle();

    const after = await ctx.db.select().from(gameEvent).where(eq(gameEvent.gameId, ctx.room.id)).orderBy(asc(gameEvent.at));
    // Лише справжня зміна після підйому — зняття паузи ведучим.
    expect(after.map((r) => r.kind)).toEqual(['start', 'resume']);
    expect(after.filter((r) => r.kind === 'start')).toHaveLength(1);
    expect(after.filter((r) => r.kind === 'join')).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('the exact continuation trims later events', async () => {
    const ctx = await setup();
    firstQuestion(ctx);
    ctx.manager.answer(ctx.room, ctx.olia, correct);
    ctx.manager.answer(ctx.room, ctx.petro, wrong);
    ctx.host({ type: 'next' });
    ctx.host({ type: 'next' });
    expect(ctx.room.state.phase).toBe('leaderboard');
    const checkpoint = ctx.room.state;
    ctx.tick();
    ctx.host({ type: 'next' });
    ctx.tick();
    ctx.host({ type: 'pause' });
    const rows = await ctx.events();
    expect(rows.map((r) => [r.kind, r.questionIndex])).toEqual([
      ['start', -1],
      ['pause', 1],
    ]);

    await trimToCheckpoint(ctx.db, ctx.room.id, checkpoint);
    expect((await ctx.events()).map((r) => r.kind)).toEqual(['start']);
  });

  it('GAME_STATE_VERSION stays 22', () => {
    expect(GAME_STATE_VERSION).toBe(22);
  });
});
