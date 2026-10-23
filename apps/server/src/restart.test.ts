import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import type { AckResult, ClientToServerEvents, GameView, ServerToClientEvents, SocketAuth } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { buildApp } from './app';
import type { Db } from './db/client';
import { game, liveRoom } from './db/schema';
import { TEST_AUTH, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type App = Awaited<ReturnType<typeof buildApp>>;

interface Tracked {
  socket: Client;
  last: GameView | null;
  /** Скільки разів сервер сказав restarting (подією або відмовою підключення). */
  restarting: number;
  errors: string[];
  waiters: { test: (view: GameView) => boolean; resolve: (view: GameView) => void }[];
  closed: boolean;
}

const apps: App[] = [];
const clients: Tracked[] = [];

afterEach(async () => {
  for (const c of clients) {
    c.closed = true;
    c.socket.close();
  }
  for (const a of apps) await a.app.close().catch(() => undefined);
  clients.length = 0;
  apps.length = 0;
});

async function boot(db: Db, instanceId: string, port = 0) {
  const ctx = await buildApp({ db, auth: TEST_AUTH, persist: { instanceId, saveDelayMs: 0 } });
  apps.push(ctx);
  await ctx.app.listen({ port, host: '127.0.0.1' });
  return { ctx, port: (ctx.app.server.address() as AddressInfo).port };
}

/** Клієнт, що перепідключається сам (як браузер), з останнім зрізом і подіями restarting. */
function client(port: number, auth: SocketAuth): Tracked {
  const socket: Client = connect(`http://127.0.0.1:${port}`, {
    auth,
    transports: ['websocket'],
    reconnectionDelay: 50,
    reconnectionDelayMax: 100,
  });
  const tracked: Tracked = { socket, last: null, restarting: 0, errors: [], waiters: [], closed: false };
  clients.push(tracked);
  // Після розриву сервером і після відмови проміжної функції socket.io сам не повторює.
  const retry = () =>
    setTimeout(() => {
      if (!tracked.closed && !socket.connected) socket.connect();
    }, 50);
  socket.on('state', (view) => {
    tracked.last = view;
    const ready = tracked.waiters.filter((waiter) => waiter.test(view));
    tracked.waiters = tracked.waiters.filter((waiter) => !ready.includes(waiter));
    for (const waiter of ready) waiter.resolve(view);
  });
  socket.on('restarting', () => {
    tracked.restarting += 1;
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') retry();
  });
  socket.on('connect_error', (error) => {
    tracked.errors.push(error.message);
    if (error.message === 'restarting') tracked.restarting += 1;
    if (!socket.active) retry();
  });
  return tracked;
}

function until(tracked: Tracked, test: (view: GameView) => boolean): Promise<GameView> {
  if (tracked.last !== null && test(tracked.last)) return Promise.resolve(tracked.last);
  return new Promise((resolve) => tracked.waiters.push({ test, resolve }));
}

async function eventually(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(check()).toBe(true);
}

function send(tracked: Tracked, event: string, ...args: unknown[]): Promise<AckResult> {
  const emit = tracked.socket.emit.bind(tracked.socket) as (event: string, ...args: unknown[]) => void;
  return new Promise((resolve) => emit(event, ...args, resolve));
}

async function join(ctx: App, code: string, nickname: string) {
  const response = await ctx.app.inject({ method: 'POST', url: `/api/games/by-code/${code}/join`, payload: { nickname } });
  expect(response.statusCode).toBe(201);
  return response.json() as { token: string; playerId: string };
}

/** Одна спроба підключення без повторів: зріз або повідомлення помилки. */
function attempt(port: number, auth: SocketAuth): Promise<string> {
  const socket: Client = connect(`http://127.0.0.1:${port}`, { auth, transports: ['websocket'], reconnection: false });
  return new Promise((resolve) => {
    socket.on('state', (view) => {
      socket.close();
      resolve(`state:${view.phase}`);
    });
    socket.on('connect_error', (error) => {
      socket.close();
      resolve(error.message);
    });
  });
}

const inPhase = (phase: GameView['phase']) => (view: GameView) => view.phase === phase;
const correct = { type: 'single', optionId: 'b' };
const wrong = { type: 'single', optionId: 'a' };

describe('a server restart', () => {
  it('keeps the game: the clients reconnect to a paused question and the host resumes it', async () => {
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeQuiz([single, text]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const tarasJoin = await join(first.ctx, started.code, 'Тарас');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    const taras = client(first.port, { code: started.code, role: 'player', token: tarasJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    await until(host, (view) => view.answeredCount === 1);

    await first.ctx.shutdown();
    expect(host.restarting).toBeGreaterThan(0);
    const [row] = await db.select().from(liveRoom).where(eq(liveRoom.code, started.code));
    expect(row.owner).toBeNull();
    const [during] = await db.select().from(game).where(eq(game.id, started.gameId));
    expect(during.status).toBe('running');

    host.last = olena.last = taras.last = null;
    const second = await boot(db, 'b', first.port);
    // Клієнти перепідключилися самі з тими самими токенами.
    const paused = await until(host, (view) => view.role === 'host' && view.paused);
    expect(paused.phase).toBe('question');
    expect(paused.questionIndex).toBe(0);
    expect(paused.role === 'host' && paused.players.map((p) => p.nickname).sort()).toEqual(['Олена', 'Тарас']);
    await until(host, (view) => view.role === 'host' && view.players.every((p) => p.connected));
    const mine = await until(olena, inPhase('question'));
    expect(mine.role === 'player' && mine.me.answer).toEqual(correct);
    expect(mine.answeredCount).toBe(1);

    expect(await send(host, 'host:resume')).toEqual({ ok: true });
    await until(taras, (view) => view.phase === 'question' && !view.paused);
    expect(await send(taras, 'player:answer', wrong)).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const reveal = await until(host, inPhase('reveal'));
    const scores = reveal.role === 'host' ? Object.fromEntries(reveal.players.map((p) => [p.nickname, p.score])) : {};
    expect(scores['Олена']).toBeGreaterThan(0);
    expect(scores['Тарас']).toBe(0);

    await second.ctx.recorder.idle();
    const [saved] = await db.select().from(game).where(eq(game.id, started.gameId));
    expect(saved.status).toBe('running');
  });

  it('answers restarting while another instance owns the room, and unauthorized for an unknown code', async () => {
    const db = await createTestDb();
    const a = await boot(db, 'a');
    const { game: started } = await startGame(a.ctx.app, makeQuiz([single, text]));
    const olenaJoin = await join(a.ctx, started.code, 'Олена');
    await a.ctx.store!.flushAll();

    const b = await boot(db, 'b');
    const auth: SocketAuth = { code: started.code, role: 'player', token: olenaJoin.token };
    expect(await attempt(b.port, auth)).toBe('restarting');
    expect(await attempt(b.port, { ...auth, code: '000000' })).toBe('unauthorized');

    const joined = await b.ctx.app.inject({
      method: 'POST',
      url: `/api/games/by-code/${started.code}/join`,
      payload: { nickname: 'Тарас' },
    });
    expect(joined.statusCode).toBe(503);
    expect(joined.json()).toEqual({ error: 'restarting' });
    const found = await b.ctx.app.inject({ method: 'GET', url: `/api/games/by-code/${started.code}` });
    expect(found.statusCode).toBe(503);
    expect(found.json()).toEqual({ error: 'restarting' });
    const access = await b.ctx.app.inject({ method: 'GET', url: `/api/games/by-code/${started.code}/host-access` });
    expect(access.statusCode).toBe(503);
    expect((await b.ctx.app.inject({ method: 'GET', url: '/api/games/by-code/000000' })).statusCode).toBe(404);

    await a.ctx.shutdown();
    expect(await attempt(b.port, auth)).toBe('state:lobby');
    expect(b.ctx.manager.get(started.code)?.id).toBe(started.gameId);
  });

  it('an action during shutdown is refused with restarting, not lost', async () => {
    const db = await createTestDb();
    const { ctx } = await boot(db, 'a');
    const { game: started, cookie, quizId } = await startGame(ctx.app, makeQuiz([single, text]));
    const olenaJoin = await join(ctx, started.code, 'Олена');
    const room = ctx.manager.get(started.code)!;
    ctx.manager.freeze();
    expect(ctx.manager.answer(room, olenaJoin.playerId, correct as never)).toEqual({ ok: false, error: 'restarting' });

    // Новий гравець і нова кімната на зупинці не з'являються: їх уже не записати в базу.
    const joined = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/by-code/${started.code}/join`,
      payload: { nickname: 'Тарас' },
    });
    expect(joined.statusCode).toBe(503);
    expect(joined.json()).toEqual({ error: 'restarting' });
    const created = await ctx.app.inject({ method: 'POST', url: '/api/games', payload: { quizId }, headers: { cookie } });
    expect(created.statusCode).toBe(503);
    expect(created.json()).toEqual({ error: 'restarting' });
    expect(ctx.manager.size).toBe(1);
  });

  it('an evicted room tells its sockets to reconnect', async () => {
    const db = await createTestDb();
    const a = await boot(db, 'a');
    const { game: started } = await startGame(a.ctx.app, makeQuiz([single, text]));
    const host = client(a.port, { code: started.code, role: 'host', token: started.hostToken });
    await until(host, inPhase('lobby'));
    a.ctx.manager.evict(a.ctx.manager.get(started.code)!);
    await eventually(() => host.restarting > 0);
  });
});
