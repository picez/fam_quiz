import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { blitzRound, chain, classicRound, makeQuiz, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import type { AckResult, ClientToServerEvents, GameView, ServerToClientEvents, SocketAuth } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { TEST_AUTH, startGame, type StartedGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Tracked {
  socket: Client;
  last: GameView | null;
  waiters: { test: (view: GameView) => boolean; resolve: (view: GameView) => void }[];
}

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
let url: string;
let sockets: Client[];

beforeEach(async () => {
  sockets = [];
  ctx = await buildApp({ db, auth: TEST_AUTH });
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.close();
  await ctx.app.close();
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

/** Чекає на зріз стану, що задовольняє умову (або повертає вже отриманий). */
function until(tracked: Tracked, test: (view: GameView) => boolean): Promise<GameView> {
  if (tracked.last !== null && test(tracked.last)) return Promise.resolve(tracked.last);
  return new Promise((resolve) => tracked.waiters.push({ test, resolve }));
}

function send(tracked: Tracked, event: string, ...args: unknown[]): Promise<AckResult> {
  // Події різних типів мають різні аргументи; тест перевіряє поведінку, а не типи emit.
  const emit = tracked.socket.emit.bind(tracked.socket) as (event: string, ...args: unknown[]) => void;
  return new Promise((resolve) => emit(event, ...args, resolve));
}

const createGame = async () => (await startGame(ctx.app, makeQuiz([single, text]))).game;

async function join(code: string, nickname: string) {
  const response = await ctx.app.inject({
    method: 'POST',
    url: `/api/games/by-code/${code}/join`,
    payload: { nickname },
  });
  return response.json() as { token: string; playerId: string };
}

/** Гра з ведучим, сценою і двома підключеними гравцями в лобі. */
async function lobby(created?: StartedGame) {
  const game = created ?? (await createGame());
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
const wrong = { type: 'single', optionId: 'a' };

describe('connecting', () => {
  it('refuses a connection with a wrong token', async () => {
    const game = await createGame();
    const socket: Client = connect(url, {
      auth: { code: game.code, role: 'host', token: 'nope' },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('sends each role its own view right after connecting', async () => {
    const { host, stage, olena } = await lobby();
    expect((await until(host, inPhase('lobby'))).role).toBe('host');
    expect((await until(stage, inPhase('lobby'))).role).toBe('stage');
    const view = await until(olena, inPhase('lobby'));
    expect(view.role === 'player' && view.me.nickname).toBe('Олена');
  });
});

describe('a round over real sockets', () => {
  it('plays a question from start to reveal without leaking the answer', async () => {
    const { host, stage, olena, taras } = await lobby();

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const question = await until(olena, inPhase('question'));
    expect(question.question?.text).toBe('Столиця України?');
    expect(JSON.stringify(question)).not.toContain('correctId');
    expect(JSON.stringify(await until(stage, inPhase('question')))).not.toContain('correctId');

    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', wrong)).toEqual({ ok: true });

    const locked = await until(olena, inPhase('locked'));
    expect(JSON.stringify(locked)).not.toContain('correctId');

    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const reveal = await until(olena, inPhase('reveal'));
    expect(reveal.role === 'player' && reveal.me.result?.accepted).toBe(true);
    const stageReveal = await until(stage, inPhase('reveal'));
    expect(stageReveal.role === 'stage' && stageReveal.stats).toMatchObject({ answered: 2, accepted: 1 });
  });

  it('lets the host end the round: the last round ends the game', async () => {
    const { host, olena } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(olena, 'host:end-round')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:end-round')).toEqual({ ok: true });
    await until(olena, inPhase('finished'));
  });

  it('shows the round summary when the host ends a round that is not the last', async () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single]), classicRound('r2', [text])]);
    const { host, olena } = await lobby((await startGame(ctx.app, quiz)).game);
    await send(host, 'host:start');
    await until(olena, inPhase('intro'));
    expect(await send(host, 'host:end-round')).toEqual({ ok: true });
    const view = await until(olena, inPhase('round_end'));
    expect(view.round).toMatchObject({ index: 0, total: 2 });
  });

  it('refuses a partial grade in a round without partial points', async () => {
    const { host, olena, taras, tarasJoin } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    await send(olena, 'player:answer', correct);
    await send(taras, 'player:answer', wrong);
    await until(host, inPhase('locked'));
    await send(host, 'host:next');
    await until(host, inPhase('reveal'));
    const tarasId = tarasJoin.playerId;
    expect(await send(host, 'host:override', { playerId: tarasId, grade: 'partial' })).toEqual({
      ok: false,
      error: 'partial_disabled',
    });
    expect(await send(host, 'host:override', { playerId: tarasId, accepted: true })).toEqual({
      ok: false,
      error: 'invalid_payload',
    });
    expect(await send(host, 'host:override', { playerId: tarasId, grade: 'correct' })).toEqual({ ok: true });
  });

  it('reports engine errors through the acknowledgement', async () => {
    const { host, olena } = await lobby();
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:next')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('permissions and bad input', () => {
  it('forbids host actions to players and the stage, and answers to the host', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(olena, 'host:start')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:start')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:kick', { playerId: 'x' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:answer', correct)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects malformed payloads', async () => {
    const { host, olena } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', { type: 'single' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:kick', { player: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:override', 'x')).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('host:time is accepted only from the host and only with ±15', async () => {
    const { host, olena } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'host:time', { seconds: 15 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:time', { seconds: 10 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:time', { seconds: -15 })).toEqual({ ok: true });
  });

  it('host:accept and host:repick are accepted only from the host', async () => {
    const { host, olena } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'host:accept', { playerId: 'p1' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:repick', { playerId: 'p1' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:accept')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:repick', { playerId: '' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:accept', { playerId: 'p1' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:repick', { playerId: 'p1' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('player:buzz and host:judge are accepted only from their roles', async () => {
    const game = (await startGame(ctx.app, makeRoundsQuiz([blitzRound('b1', [single], { check: 'manual' })]))).game;
    const { host, stage, olena, olenaJoin } = await lobby(game);
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));

    expect(await send(host, 'player:buzz')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:buzz')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:judge', { playerId: olenaJoin.playerId, correct: true })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:judge', { playerId: 1 })).toEqual({ ok: false, error: 'invalid_payload' });

    expect(await send(olena, 'player:buzz')).toEqual({ ok: true });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(host, 'host:judge', { playerId: olenaJoin.playerId, correct: true })).toEqual({ ok: true });
    expect((await until(olena, inPhase('locked'))).phase).toBe('locked');
  });

  it('board events are accepted only from their roles and with valid payloads', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(host, 'player:pick', { cellId: 'c11' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:pick', { cellId: 'c11' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:skip')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:roll')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:pick', { cellId: 'c11' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:order', { playerIds: [] })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:pick', { cellId: '' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:pick', { cellId: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:order', { playerIds: 'x' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:skip')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('survives events without an acknowledgement or with junk arguments', async () => {
    const { host, olena } = await lobby();
    const raw = olena.socket.emit.bind(olena.socket) as (event: string, ...args: unknown[]) => void;
    raw('player:answer');
    raw('player:answer', 'junk', 'not a function');
    raw('host:start', 42);
    raw('host:kick');

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    expect((await until(olena, inPhase('question'))).phase).toBe('question');
  });
});

describe('reconnecting and kicking', () => {
  it('lets a player come back with the same token and receive the current state', async () => {
    const { game, host, olena, olenaJoin } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    await send(olena, 'player:answer', correct);

    olena.socket.close();
    await until(host, (view) => view.role === 'host' && view.players[0].connected === false);

    const back = open({ code: game.code, role: 'player', token: olenaJoin.token });
    const view = await until(back, inPhase('question'));
    expect(view.role === 'player' && view.me.answer).toEqual(correct);
    await until(host, (hostView) => hostView.role === 'host' && hostView.players[0].connected === true);
  });

  it('tells a kicked player why and closes their connection', async () => {
    const { game, host, olena, olenaJoin } = await lobby();
    const closed = new Promise<string>((resolve) => olena.socket.on('closed', resolve));
    const disconnected = new Promise<void>((resolve) => olena.socket.on('disconnect', () => resolve()));

    expect(await send(host, 'host:kick', { playerId: olenaJoin.playerId })).toEqual({ ok: true });
    expect(await closed).toBe('kicked');
    await disconnected;

    const again: Client = connect(url, {
      auth: { code: game.code, role: 'player', token: olenaJoin.token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(again);
    const error = await new Promise<Error>((resolve) => again.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });
});

describe('host presence', () => {
  it('tells players when the host arrives and leaves', async () => {
    const game = await createGame();
    const joined = await join(game.code, 'Олена');
    const olena = open({ code: game.code, role: 'player', token: joined.token });
    const presence = (online: boolean) =>
      new Promise<void>((resolve) =>
        olena.socket.on('state', (_view, meta) => {
          if (meta.hostOnline === online) resolve();
        }),
      );

    await presence(false);
    const arrived = presence(true);
    const host = open({ code: game.code, role: 'host', token: game.hostToken });
    await arrived;

    const left = presence(false);
    host.socket.close();
    await left;
  });
  it('player:guess and player:hint are player-only and validated', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(host, 'player:guess', { word: 'Риба' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:guess', { word: 'Риба' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:hint')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:hint')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:guess')).toEqual({ ok: false, error: 'invalid_payload' });
    for (const word of [5, 'а'.repeat(31), null]) {
      expect(await send(olena, 'player:guess', { word })).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:guess', { word: 'Риба' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(olena, 'player:hint')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('plays a chain over sockets: a wrong word, a hint, a finish', async () => {
    const created = (await startGame(ctx.app, makeQuiz([chain]))).game;
    const { host, stage, olena, taras, olenaJoin } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));

    expect(await send(olena, 'player:guess', { word: 'Сом' })).toEqual({ ok: false, error: 'wrong_word' });
    expect(await send(olena, 'player:hint')).toEqual({ ok: true });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.chain?.hints === 1);
    const theirs = await until(taras, (view) => view.role === 'player' && view.phase === 'question');
    if (mine.role !== 'player' || theirs.role !== 'player') throw new Error('not players');
    expect(mine.me.chain?.masks[0]).toEqual(['Р', 'и', null, null]);
    expect(theirs.me.chain?.masks[0]).toEqual(['Р', null, null, null]);

    olena.socket.close();
    const back = open({ code: created.code, role: 'player', token: olenaJoin.token });
    const restored = await until(back, (view) => view.role === 'player' && view.me.chain !== null);
    if (restored.role !== 'player') throw new Error('not a player');
    expect(restored.me.chain?.masks[0]).toEqual(['Р', 'и', null, null]);

    for (const word of ['Риба', 'Океан', 'Корабель']) {
      expect(await send(back, 'player:guess', { word })).toEqual({ ok: true });
    }
    const scene = await until(stage, (view) => view.chain?.rows.some((row) => row.timeMs !== null) === true);
    expect(scene.chain?.rows[0].timeMs).not.toBeNull();
  });
  it('player:wager is player-only and validated', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(host, 'player:wager', { amount: 0 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:wager', { amount: 0 })).toEqual({ ok: false, error: 'forbidden' });
    for (const amount of [-1, 1.5, '5']) {
      expect(await send(olena, 'player:wager', { amount })).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:wager')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:wager', { amount: 0 })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
