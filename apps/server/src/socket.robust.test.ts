import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { LIMITS, type AckResult, type ClientToServerEvents, type GameView, type ServerToClientEvents, type SocketAuth } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { log, setErrorReporter, type ErrorContext } from './log';
import { MAX_MESSAGE_BYTES, SOCKET_EVENTS_PER_SECOND, SOCKET_PING_INTERVAL_MS, SOCKET_PING_TIMEOUT_MS } from './socket';
import { TEST_AUTH, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Tracked {
  socket: Client;
  last: GameView | null;
  waiters: { test: (view: GameView) => boolean; resolve: (view: GameView) => void }[];
}

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
let url: string;
let sockets: Client[];
let reports: { error: unknown; context: ErrorContext }[];
let unhook: () => void;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  sockets = [];
  reports = [];
  // Очікувані збої — у шпигуна, а не у вивід тестів.
  const level = log.level;
  log.level = 'silent';
  const off = setErrorReporter((error, context) => reports.push({ error, context }));
  unhook = () => {
    off();
    log.level = level;
  };
  ctx = await buildApp({ db, auth: TEST_AUTH });
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of sockets) socket.close();
  await ctx.app.close();
  unhook();
});

function open(auth: SocketAuth): Tracked {
  const socket: Client = connect(url, { auth, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const tracked: Tracked = { socket, last: null, waiters: [] };
  socket.on('state', (view) => {
    tracked.last = view;
    const ready = tracked.waiters.filter((waiter) => waiter.test(view));
    tracked.waiters = tracked.waiters.filter((waiter) => !ready.includes(waiter));
    for (const waiter of ready) waiter.resolve(view);
  });
  return tracked;
}

function until(tracked: Tracked, test: (view: GameView) => boolean): Promise<GameView> {
  if (tracked.last !== null && test(tracked.last)) return Promise.resolve(tracked.last);
  return new Promise((resolve) => tracked.waiters.push({ test, resolve }));
}

function send(tracked: Tracked, event: string, ...args: unknown[]): Promise<AckResult> {
  const emit = tracked.socket.emit.bind(tracked.socket) as (event: string, ...args: unknown[]) => void;
  return new Promise((resolve) => emit(event, ...args, resolve));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function join(code: string, nickname: string) {
  const response = await ctx.app.inject({ method: 'POST', url: `/api/games/by-code/${code}/join`, payload: { nickname } });
  return response.json() as { token: string; playerId: string };
}

async function lobby() {
  const { game } = await startGame(ctx.app, makeQuiz([single, text]));
  const olenaJoin = await join(game.code, 'Олена');
  const tarasJoin = await join(game.code, 'Тарас');
  const host = open({ code: game.code, role: 'host', token: game.hostToken });
  const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
  const olena = open({ code: game.code, role: 'player', token: olenaJoin.token });
  const taras = open({ code: game.code, role: 'player', token: tarasJoin.token });
  await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);
  return { game, host, stage, olena, taras, olenaJoin, tarasJoin };
}

const inPhase = (phase: GameView['phase']) => (view: GameView) => view.phase === phase;
const correct = { type: 'single', optionId: 'b' };

describe('a handler that throws (30a)', () => {
  it('answers internal, keeps the room and its state, and the next events and broadcasts still work', async () => {
    const { game, host, stage, olena, taras } = await lobby();
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    const room = ctx.manager.get(game.code)!;
    const before = room.state;

    vi.spyOn(ctx.manager, 'answer').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'internal' });
    expect(ctx.manager.get(game.code)).toBe(room);
    expect(room.state).toBe(before);
    expect(reports).toHaveLength(1);
    expect(reports[0].context).toEqual({ where: 'socket', room: game.code, role: 'player', event: 'player:answer' });
    // Ні токена, ні відповіді в контексті журналу.
    expect(JSON.stringify(reports[0].context)).not.toContain(game.hostToken);

    // Наступна подія того самого сокета — звичайна, розсилка доходить до інших.
    expect(await send(taras, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    await Promise.all([until(host, inPhase('locked')), until(stage, inPhase('locked')), until(taras, inPhase('locked'))]);
  });

  it('a handler that throws after the state was assigned (mid-commit) rolls the state back, and the same action then works', async () => {
    const { game, host, olena } = await lobby();
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    const room = ctx.manager.get(game.code)!;
    const before = room.state;
    const checkpoint = room.checkpoint;
    vi.spyOn(ctx.manager, 'answer').mockImplementationOnce((target) => {
      // Як збій посеред commit: новий стан і контрольна точка вже присвоєні, розсилки й запису ще не було.
      target.state = { ...target.state, paused: true };
      target.checkpoint = { state: target.state, at: 1 };
      throw new Error('mid-commit');
    });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'internal' });
    expect(room.state).toBe(before);
    expect(room.checkpoint).toBe(checkpoint);
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(room.state.paused).toBe(false);
  });

  it('a slice that fails for one socket is reported, and the others still get theirs', async () => {
    const { game, host, stage, olena, taras } = await lobby();
    const view = ctx.manager.view.bind(ctx.manager);
    vi.spyOn(ctx.manager, 'view').mockImplementation((room, identity) => {
      if (identity.role === 'stage') throw new Error('slice');
      return view(room, identity);
    });
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await Promise.all([until(host, inPhase('question')), until(olena, inPhase('question')), until(taras, inPhase('question'))]);
    expect(stage.last?.phase).toBe('lobby');
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((report) => report.context.where === 'socket-push' && report.context.room === game.code && report.context.role === 'stage')).toBe(true);
  });
});

describe('the per-socket event limit (30a)', () => {
  it(`refuses the ${SOCKET_EVENTS_PER_SECOND + 1}th event within a second with rate_limited, and accepts again a second later`, async () => {
    const { olena, host } = await lobby();
    const burst = await Promise.all(Array.from({ length: SOCKET_EVENTS_PER_SECOND + 1 }, () => send(olena, 'player:buzz')));
    // У лобі натискання відхиляє рушій — але жодне з перших двадцяти не відхилене лімітом.
    expect(burst.slice(0, SOCKET_EVENTS_PER_SECOND).filter((result) => !result.ok && result.error === 'rate_limited')).toEqual([]);
    expect(burst[SOCKET_EVENTS_PER_SECOND]).toEqual({ ok: false, error: 'rate_limited' });
    // Ліміт — на сокет: інші сокети кімнати не зачеплено.
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    await pause(1050);
    expect(await send(olena, 'player:buzz')).not.toEqual({ ok: false, error: 'rate_limited' });
  });

  it('drawing operations and sort tilts have their own limits and do not use the socket budget', async () => {
    const { olena } = await lobby();
    const op = { op: 'begin', c: 0, w: 0, p: [10, 10, 20, 20] };
    await Promise.all(Array.from({ length: 30 }, () => send(olena, 'player:draw', op)));
    await Promise.all(Array.from({ length: 30 }, () => send(olena, 'player:sort-tilt', { wordId: 'w', categoryId: null, amount: 0 })));
    expect(await send(olena, 'player:buzz')).not.toEqual({ ok: false, error: 'rate_limited' });
  });
});

describe('the largest message (30a)', () => {
  it('a drawing operation of the largest legitimate size gets through', async () => {
    const { olena } = await lobby();
    const p = Array.from({ length: LIMITS.drawBatch * 2 }, () => 1000);
    const result = await send(olena, 'player:draw', { op: 'begin', c: 0, w: 0, p });
    // Не художник у лобі — відмова рушія, але повідомлення дійшло й отримало відповідь.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).not.toBe('invalid_payload');
    expect(olena.socket.connected).toBe(true);
  });

  it('a message over the limit drops only that connection', async () => {
    const { olena, host } = await lobby();
    const closed = new Promise<string>((resolve) => olena.socket.on('disconnect', (reason) => resolve(reason)));
    const raw = olena.socket.emit.bind(olena.socket) as (event: string, ...args: unknown[]) => void;
    raw('player:answer', { type: 'text', value: 'я'.repeat(MAX_MESSAGE_BYTES) });
    expect(await closed).toBeTruthy();
    // Кімната й інші сокети живі.
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(host.socket.connected).toBe(true);
  });
});

describe('the connection-quality ping (32)', () => {
  const ping = (tracked: Tracked) =>
    new Promise<unknown>((resolve) => (tracked.socket.emit as (event: string, ...args: unknown[]) => void)('net:ping', resolve));

  it('answers every role with the server time and never touches the room or sends a slice', async () => {
    const { game, host, stage, olena } = await lobby();
    // Зрізи від підключень лобі встигають дійти до всіх.
    await pause(300);
    const room = ctx.manager.get(game.code)!;
    const before = room.state;
    let slices = 0;
    for (const tracked of [host, stage, olena]) tracked.socket.on('state', () => (slices += 1));
    for (const tracked of [host, stage, olena]) {
      const sent = ctx.manager.now();
      const answer = (await ping(tracked)) as { now: number };
      expect(Object.keys(answer)).toEqual(['now']);
      expect(answer.now).toBeGreaterThanOrEqual(sent);
      expect(answer.now).toBeLessThanOrEqual(ctx.manager.now());
    }
    await pause(100);
    expect(slices).toBe(0);
    expect(room.state).toBe(before);
  });

  it('counts in the socket budget and a ping past it is refused without dropping the socket', async () => {
    const { olena } = await lobby();
    const burst = await Promise.all(Array.from({ length: SOCKET_EVENTS_PER_SECOND + 1 }, () => ping(olena)));
    expect(burst.slice(0, SOCKET_EVENTS_PER_SECOND).every((answer) => typeof (answer as { now?: unknown }).now === 'number')).toBe(true);
    expect(burst[SOCKET_EVENTS_PER_SECOND]).toEqual({ ok: false, error: 'rate_limited' });
    expect(olena.socket.connected).toBe(true);
    // Пінги з’їли бюджет: наступна подія в ту ж секунду теж відмовлена — пінг рахується як усі.
    expect(await send(olena, 'player:buzz')).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('a ping without an ack function is ignored quietly', async () => {
    const { olena } = await lobby();
    (olena.socket.emit as (event: string, ...args: unknown[]) => void)('net:ping', 'not a function');
    expect(((await ping(olena)) as { now: number }).now).toBeTypeOf('number');
    expect(reports).toEqual([]);
  });

  it('engine.io notices a dead connection within 25 s', () => {
    expect(SOCKET_PING_INTERVAL_MS).toBe(15_000);
    expect(SOCKET_PING_TIMEOUT_MS).toBe(10_000);
    const opts = (ctx.io as unknown as { engine: { opts: { pingInterval: number; pingTimeout: number } } }).engine.opts;
    expect(opts.pingInterval).toBe(SOCKET_PING_INTERVAL_MS);
    expect(opts.pingTimeout).toBe(SOCKET_PING_TIMEOUT_MS);
  });
});
