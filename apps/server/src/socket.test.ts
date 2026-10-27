import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { bluff, blitzRound, boardRound, bool, chain, classicRound, clues, cloud, duels, finalRound, makeQuiz, makeRoundsQuiz, single, sortQ, survey, survivalQuestions, survivalRound, survivalTrials, text, wall, withAudio, withId, wipeoutLadder, wipeoutRound, ladderRound } from '@quiz/engine/testing';
import { DEFAULT_RULES, defaultTeams, SPLASH_MS, type AckResult, type ClientToServerEvents, type GameView, type ServerToClientEvents, type SocketAuth, type SortTilt } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { TEST_AUTH, signUp, startGame, type StartedGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { FakeScheduler } from './testing/fake-scheduler';
import { SURVIVAL_RIGHT, SURVIVAL_WRONG, TRIAL_RIGHT, TRIAL_WRONG } from './testing/survival-game';
import { LADDER_RIGHT } from './testing/ladder-game';
import { WIPEOUT_RIGHT } from './testing/wipeout-game';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Tracked {
  socket: Client;
  last: GameView | null;
  /** Скільки зрізів state отримано. */
  states: number;
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
  const tracked: Tracked = { socket, last: null, states: 0, waiters: [] };
  socket.on('state', (view) => {
    tracked.last = view;
    tracked.states += 1;
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

/** Збирає нахили сортування (11d), що прийшли сокету. */
function listenTilt(tracked: Tracked): SortTilt[] {
  const received: SortTilt[] = [];
  tracked.socket.on('sort:tilt', (tilt) => received.push(tilt));
  return received;
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

describe('transition splashes over real sockets', () => {
  it('shows the round splash to the stage and refuses an answer before the question starts', async () => {
    await ctx.app.close();
    ctx = await buildApp({ db, auth: TEST_AUTH, transitions: true });
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const { host, stage, olena } = await lobby();

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    const intro = await until(stage, inPhase('intro'));
    expect(intro.splash?.kind).toBe('round');
    expect(intro.splash && intro.splash.until - intro.splash.at).toBe(SPLASH_MS.round);

    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'not_started' });
  });
});

describe('pacing over real sockets (11b)', () => {
  it('answers too_soon before the window and steps once it has passed', async () => {
    await ctx.app.close();
    const scheduler = new FakeScheduler();
    ctx = await buildApp({ db, auth: TEST_AUTH, pacing: true, scheduler });
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const { host, olena } = await lobby();

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: false, error: 'too_soon' });
    scheduler.advance(3000);
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
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

  it('host:adjust is host-only and takes a whole non-zero sum', async () => {
    const { host, olena, olenaJoin } = await lobby();
    await send(host, 'host:start');
    expect(await send(olena, 'host:adjust', { playerId: olenaJoin.playerId, points: 50 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 0 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 1.5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 10_001 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: -100 })).toEqual({ ok: true });
  });

  it('host:undo is host-only, validated, refuses the same undo twice and returns an undo', async () => {
    const { host, stage, olena, olenaJoin } = await lobby();
    await send(host, 'host:start');
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 50 })).toEqual({ ok: true });
    expect(await send(olena, 'host:undo', { target: { seq: 1 } })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:undo', { target: { seq: 1 } })).toEqual({ ok: false, error: 'forbidden' });
    for (const target of [{}, { seq: 0 }, { question: -1 }, { round: 'x' }]) {
      expect(await send(host, 'host:undo', { target })).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(host, 'host:undo', { target: { seq: 1 } })).toEqual({ ok: true });
    expect(await send(host, 'host:undo', { target: { seq: 1 } })).toEqual({ ok: false, error: 'already_undone' });
    expect(await send(host, 'host:undo', { target: { seq: 2 } })).toEqual({ ok: true });
  });

  it('host:debuff and host:undebuff are host-only and validated', async () => {
    const { host, olena, olenaJoin } = await lobby();
    await send(host, 'host:start');
    const playerId = olenaJoin.playerId;
    expect(await send(olena, 'host:debuff', { playerId, kind: 'fog' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:undebuff', { playerId })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:debuff', { playerId, kind: 'rain' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:undebuff', {})).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:debuff', { playerId, kind: 'fog' })).toEqual({ ok: true });
    expect(await send(host, 'host:undebuff', { playerId })).toEqual({ ok: true });
  });

  it('host:name is host-only and validated', async () => {
    const { host, olena } = await lobby();
    expect(await send(olena, 'host:name', { answer: null })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:name', { answer: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:name')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:name', { answer: null })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('board events are accepted only from their roles and with valid payloads', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(host, 'player:pick', { cellId: 'c11' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:pick', { cellId: 'c11' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:skip')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:roll')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:dice')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:roll')).toEqual({ ok: false, error: 'forbidden' });
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
  it('player:sort is player-only and validated', async () => {
    const created = (await startGame(ctx.app, makeQuiz([sortQ, single]))).game;
    const { host, stage, olena } = await lobby(created);
    expect(await send(host, 'player:sort', { wordId: 'w1', categoryId: 'c1' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:sort', { wordId: 'w1', categoryId: 'c1' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:sort')).toEqual({ ok: false, error: 'invalid_payload' });
    for (const payload of [{ wordId: 5, categoryId: 'c1' }, { wordId: 'w1' }, { wordId: 'w1', categoryId: null }]) {
      expect(await send(olena, 'player:sort', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:sort', { wordId: 'w1', categoryId: 'c1' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const view = await until(olena, (v) => v.role === 'player' && v.me.sort?.card != null);
    if (view.role !== 'player' || view.me.sort?.card == null) throw new Error('no card');
    const card = view.me.sort.card.id;
    const category = sortQ.words.find((w) => w.id === card)?.categoryId ?? '';
    const other = category === 'c1' ? 'c2' : 'c1';
    expect(await send(olena, 'player:sort', { wordId: card, categoryId: other })).toEqual({ ok: true });
    expect(await send(olena, 'player:sort', { wordId: card, categoryId: category })).toEqual({ ok: false, error: 'sort_locked' });
    expect(await send(olena, 'player:answer', { type: 'sort' })).toMatchObject({ ok: false });
  });

  /** Позиції плиток групи в порядку показу: тест бере їх із кімнати, телефон ідів плиток не знає. */
  const groupAt = (code: string, groupId: string) => {
    const room = ctx.manager.get(code);
    if (room === undefined) throw new Error('room missing');
    const group = wall.groups.find((g) => g.id === groupId);
    if (group === undefined) throw new Error('no group');
    return group.tiles.map((tile) => room.state.presented.indexOf(tile.id));
  };

  it('player:wall finds a group and the phone gets it by position', async () => {
    const created = (await startGame(ctx.app, makeQuiz([wall, single]))).game;
    const { host, olena } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, (v) => v.role === 'player' && v.phase === 'question');
    const tiles = groupAt(created.code, 'gr');
    expect(await send(olena, 'player:wall', { tiles })).toEqual({ ok: true });
    const view = await until(olena, (v) => v.role === 'player' && (v.me.wall?.found.length ?? 0) === 1);
    if (view.role !== 'player') throw new Error('not a player');
    expect([...(view.me.wall?.found[0].tiles ?? [])].sort((a, b) => a - b)).toEqual([...tiles].sort((a, b) => a - b));
    expect(await send(olena, 'player:wall', { tiles })).toMatchObject({ ok: false });
  });

  it('player:wall: bad payload — invalid; the host cannot send it', async () => {
    const created = (await startGame(ctx.app, makeQuiz([wall, single]))).game;
    const { host, stage, olena } = await lobby(created);
    expect(await send(host, 'player:wall', { tiles: [0, 1, 2, 3] })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:wall', { tiles: [0, 1, 2, 3] })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:wall')).toEqual({ ok: false, error: 'invalid_payload' });
    for (const payload of [{ tiles: [0, 1] }, { tiles: [0, 1, 2, 3, 4] }, { tiles: [0, 1, 2, 16] }, { tiles: [0, 1, 2, -1] }, { tiles: [0, 1, 2, 1.5] }, { tiles: 'abcd' }, {}]) {
      expect(await send(olena, 'player:wall', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:wall', { tiles: [0, 1, 2, 3] })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('no socket frame to a phone carries the wall groups', async () => {
    const created = (await startGame(ctx.app, makeQuiz([wall, single]))).game;
    const { host, olena } = await lobby(created);
    const frames: string[] = [];
    olena.socket.on('state', (view) => frames.push(JSON.stringify(view)));
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, (v) => v.role === 'player' && v.phase === 'question');
    expect(await send(olena, 'player:wall', { tiles: groupAt(created.code, 'gr') })).toEqual({ ok: true });
    await until(olena, (v) => v.role === 'player' && (v.me.wall?.found.length ?? 0) === 1);
    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) {
      for (const group of wall.groups) expect(frame).not.toContain(group.name);
      expect(frame).not.toContain('"groups"');
      for (const group of wall.groups) for (const tile of group.tiles) expect(frame).not.toContain(`"${tile.id}"`);
    }
  });

  /** Блеф (10f): гра з блефом і запитанням після нього, Олена й Тарас у фазі вигадок. */
  const bluffGame = async () => {
    const created = (await startGame(ctx.app, makeQuiz([bluff, single]))).game;
    const all = await lobby(created);
    expect(await send(all.host, 'host:start')).toEqual({ ok: true });
    expect(await send(all.host, 'host:next')).toEqual({ ok: true });
    await until(all.olena, inPhase('question'));
    return all;
  };
  const meBluff = (view: GameView) => (view.role === 'player' ? view.me.bluff : null);
  const choiceOf = (view: GameView) => view.role === 'player' && view.bluff?.stage === 'choice';
  /** Перший варіант, що не належить гравцеві. */
  const notMine = (view: GameView) => (view.role === 'player' ? view.bluff?.options.find((o) => !(view.me.bluff?.own ?? []).includes(o.id))?.id : undefined) ?? '';

  it('player:lie refuses the truth with bluff_truth and takes a lie', async () => {
    const { olena } = await bluffGame();
    expect(await send(olena, 'player:lie', { text: ' барселоні ' })).toEqual({ ok: false, error: 'bluff_truth' });
    expect(await send(olena, 'player:lie', { text: 'Рим' })).toEqual({ ok: true });
    expect(await send(olena, 'player:lie', { text: 'Париж' })).toEqual({ ok: false, error: 'already_answered' });
    const view = await until(olena, (v) => meBluff(v)?.lie === 'Рим');
    expect(view.role === 'player' && view.bluff?.stage).toBe('lies');
  });

  it('player:lie: bad payload — invalid; the host cannot send it', async () => {
    const { host, olena } = await bluffGame();
    expect(await send(host, 'player:lie', { text: 'Рим' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:lie')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:lie', { text: 'я'.repeat(61) })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:bluff', { optionId: '' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:bluff', { optionId: 'b1' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('the choice starts when everyone wrote; player:bluff refuses the own lie with bluff_own', async () => {
    const { olena, taras } = await bluffGame();
    expect(await send(olena, 'player:lie', { text: 'Рим' })).toEqual({ ok: true });
    expect(await send(taras, 'player:lie', { text: 'Париж' })).toEqual({ ok: true });
    const view = await until(olena, choiceOf);
    const mine = meBluff(view)?.own[0] ?? '';
    expect(mine).not.toBe('');
    expect(view.role === 'player' && view.bluff?.options).toHaveLength(5);
    expect(await send(olena, 'player:bluff', { optionId: mine })).toEqual({ ok: false, error: 'bluff_own' });
    expect(await send(olena, 'player:bluff', { optionId: 'nope' })).toEqual({ ok: false, error: 'not_found' });
    expect(await send(olena, 'player:bluff', { optionId: notMine(view) })).toEqual({ ok: true });
    expect(await send(olena, 'player:bluff', { optionId: notMine(view) })).toEqual({ ok: false, error: 'already_answered' });
  });

  it('host:lock in the lies starts the choice', async () => {
    const { host, olena } = await bluffGame();
    expect(await send(olena, 'player:lie', { text: 'Рим' })).toEqual({ ok: true });
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    const view = await until(olena, choiceOf);
    expect(view.phase).toBe('question');
    expect(view.role === 'player' && view.bluff?.options).toHaveLength(5);
  });

  it('host:bluff-remove hides a lie; a player cannot remove', async () => {
    const { host, olena, taras } = await bluffGame();
    expect(await send(olena, 'player:lie', { text: 'Рим' })).toEqual({ ok: true });
    expect(await send(taras, 'player:lie', { text: 'Париж' })).toEqual({ ok: true });
    const view = await until(taras, choiceOf);
    const rome = view.role === 'player' ? view.bluff?.options.find((o) => o.text === 'рим') : undefined;
    if (rome === undefined) throw new Error('no option');
    expect(await send(olena, 'host:bluff-remove', { optionId: rome.id })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:bluff-remove', {})).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:bluff-remove', { optionId: rome.id })).toEqual({ ok: true });
    const after = await until(taras, (v) => v.role === 'player' && v.bluff?.options.some((o) => o.text === 'рим') === false);
    expect(after.role === 'player' && after.bluff?.options).toHaveLength(4);
  });

  it('host:next steps options, host:bluff-all opens all', async () => {
    const { host, stage, olena, taras } = await bluffGame();
    expect(await send(olena, 'player:lie', { text: 'Рим' })).toEqual({ ok: true });
    expect(await send(taras, 'player:lie', { text: 'Париж' })).toEqual({ ok: true });
    expect(await send(olena, 'player:bluff', { optionId: notMine(await until(olena, choiceOf)) })).toEqual({ ok: true });
    expect(await send(taras, 'player:bluff', { optionId: notMine(await until(taras, choiceOf)) })).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    expect(await send(host, 'host:bluff-all')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(stage, inPhase('reveal'));
    expect(await send(olena, 'host:bluff-all')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const one = await until(stage, (v) => v.role === 'stage' && v.bluff?.shown === 1);
    expect(one.role === 'stage' && one.bluff?.total).toBe(5);
    expect(await send(host, 'host:bluff-all')).toEqual({ ok: true });
    const all = await until(stage, (v) => v.role === 'stage' && v.bluff?.shown === 5);
    if (all.role !== 'stage') throw new Error('not the stage');
    expect(all.bluff?.options.filter((o) => o.kind === 'truth')).toHaveLength(1);
  });

  it('no socket frame to a phone or the stage carries the truth or spares before the choice, or kind and authors before the reveal', async () => {
    const { host, stage, olena, taras } = await bluffGame();
    const lies: string[] = [];
    const choice: string[] = [];
    for (const watcher of [olena, taras, stage]) {
      watcher.socket.on('state', (view) => {
        if (view.phase !== 'question' && view.phase !== 'locked') return;
        (view.role !== 'host' && view.bluff?.stage === 'choice' ? choice : lies).push(JSON.stringify(view));
      });
    }
    expect(await send(olena, 'player:lie', { text: 'Рим' })).toEqual({ ok: true });
    expect(await send(taras, 'player:lie', { text: 'Париж' })).toEqual({ ok: true });
    expect(await send(olena, 'player:bluff', { optionId: notMine(await until(olena, choiceOf)) })).toEqual({ ok: true });
    expect(await send(taras, 'player:bluff', { optionId: notMine(await until(taras, choiceOf)) })).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    await until(stage, (v) => v.phase === 'locked');

    expect(lies.length).toBeGreaterThan(1);
    for (const frame of lies) {
      for (const secret of ['Барселона', 'Барселоні', 'Мадрид', 'Лондон', 'Брюссель']) expect(frame).not.toContain(secret);
    }
    expect(choice.length).toBeGreaterThan(1);
    for (const frame of choice) {
      for (const kind of ['truth', 'lie', 'spare']) expect(frame).not.toContain(`"kind":"${kind}"`);
      expect(frame).not.toContain('"authors":["');
      expect(frame).not.toContain('"pickedBy":["');
    }
  });

  it('host:cloud-hide hides a word from the stage', async () => {
    const created = (await startGame(ctx.app, makeQuiz([cloud, single]))).game;
    const { host, stage, olena, taras } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, (v) => v.role === 'player' && v.phase === 'question');
    expect(await send(olena, 'player:answer', { type: 'wordcloud', words: ['лайка', 'Київ'] })).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', { type: 'wordcloud', words: ['київ'] })).toEqual({ ok: true });
    // Обоє відповіли: запитання закрилося само, далі розкриття.
    await until(host, inPhase('locked'));
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const shown = await until(stage, (v) => v.phase === 'reveal');
    if (shown.role !== 'stage') throw new Error('not the stage');
    expect(shown.cloud?.map((w) => w.key).sort()).toEqual(['київ', 'лайка']);

    expect(await send(olena, 'host:cloud-hide', { key: 'лайка', hidden: true })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:cloud-hide', { hidden: true })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:cloud-hide', { key: 'лайка', hidden: true })).toEqual({ ok: true });
    const hidden = await until(stage, (v) => v.role === 'stage' && v.cloud?.some((w) => w.key === 'лайка') === false);
    if (hidden.role !== 'stage') throw new Error('not the stage');
    expect(hidden.cloud?.map((w) => w.key)).toEqual(['київ']);
    expect(JSON.stringify(hidden)).not.toContain('лайка');
    expect(await send(host, 'host:cloud-hide', { key: 'лайка', hidden: false })).toEqual({ ok: true });
    await until(stage, (v) => v.role === 'stage' && v.cloud?.some((w) => w.key === 'лайка') === true);
  });

  it('buff events are role-checked and validated', async () => {
    const rules = { ...DEFAULT_RULES, penalty: 'minus' as const };
    const quiz = makeQuiz([single, text], { buffs: ['double', 'shield', 'retry'], rules });
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:buff', { kind: 'double' })).toEqual({ ok: true });
    expect(await send(host, 'player:buff', { kind: 'double' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:buff', { kind: 'double' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:buff', { kind: 'magic' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:buff')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:buff', { kind: 'shield' })).toEqual({ ok: false, error: 'buff_busy' });
    expect(await send(host, 'player:retry', { keep: true })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:retry', { keep: 'yes' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:retry', { keep: true })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('a player buys a debuff for a rival: role-checked, validated, charged, and the rival sees the buyer when it fires', async () => {
    const quiz = makeQuiz([single, text], { debuffs: ['fog'], debuffPrices: { fog: 100 } });
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena, taras, olenaJoin, tarasJoin } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    const tarasId = tarasJoin.playerId;
    expect(await send(olena, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'points_short' });
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 150 })).toEqual({ ok: true });
    expect(await send(host, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [undefined, { targetId: tarasId }, { targetId: tarasId, kind: 'magic' }, { targetId: 5, kind: 'fog' }]) {
      expect(await send(olena, 'player:debuff', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: true });
    expect(await send(olena, 'player:debuff', { targetId: tarasId, kind: 'fog' })).toEqual({ ok: false, error: 'debuff_bought' });
    const mine = await until(olena, (v) => v.role === 'player' && v.me.score === 50);
    expect(mine.debuffNotice?.target.nickname).toBe('Тарас');
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const hit = await until(taras, (v) => v.role === 'player' && v.me.debuff !== null);
    expect(hit.role === 'player' && hit.me.debuff).toMatchObject({ kind: 'fog', by: 'Олена' });
  });

  it('vote and hint events are role-checked and validated', async () => {
    const quiz = { ...makeQuiz([single, text], { buffs: ['audience', 'hint'] }), spares: [withId(bool, 's1')] };
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena, taras, olenaJoin } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(taras, 'player:answer', wrong)).toEqual({ ok: true });
    expect(await send(olena, 'player:buff', { kind: 'audience' })).toEqual({ ok: true });
    const vote = { askerId: olenaJoin.playerId, answer: correct };
    expect(await send(taras, 'player:vote', vote)).toEqual({ ok: true });
    expect(await send(host, 'player:vote', vote)).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:vote', vote)).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(taras, 'player:vote', { answer: correct })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(taras, 'player:vote', vote)).toEqual({ ok: false, error: 'already_answered' });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    // Закрите запитання → розкриття → рейтинг → наступне запитання.
    for (let step = 0; step < 3; step += 1) expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, (view) => view.phase === 'question' && view.role === 'player' && view.question?.type === 'text');
    expect(await send(olena, 'player:buff', { kind: 'hint' })).toEqual({ ok: true });
    const hint = { playerId: olenaJoin.playerId, text: 'Тече' };
    expect(await send(olena, 'host:hint', hint)).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:hint', { ...hint, text: '' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:hint', hint)).toEqual({ ok: true });
  });

  it('duel events are role-checked and validated', async () => {
    const quiz = {
      ...makeRoundsQuiz([classicRound('r1', [withId(single, 'q1'), withId(single, 'q2')]), finalRound('rf', withId(single, 'qf'))]),
      duels,
    };
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena, taras, olenaJoin, tarasJoin } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('reveal'));

    expect(await send(host, 'host:duel-skip')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:duel-cancel')).toEqual({ ok: false, error: 'not_found' });
    for (const who of [host, stage]) {
      expect(await send(who, 'player:duel', { opponentId: tarasJoin.playerId })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:duel-category', { categoryId: 'dc1' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:duel-answer', { text: 'Париж' })).toEqual({ ok: false, error: 'forbidden' });
    }
    expect(await send(olena, 'host:duel-category', { categoryId: 'dc1' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:duel-skip')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:duel-cancel')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:duel-category', { categoryId: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:duel-category', { categoryId: 'dc1' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(olena, 'player:duel', { opponentId: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:duel')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:duel-category', { categoryId: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    for (const value of ['я'.repeat(201), '', '   ', 5]) {
      expect(await send(olena, 'player:duel-answer', { text: value })).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:duel', { opponentId: tarasJoin.playerId })).toEqual({ ok: true });
    expect(await send(host, 'host:duel-cancel')).toEqual({ ok: true });
  });

  it('player:sort on a question of another type is a type mismatch', async () => {
    const created = (await startGame(ctx.app, makeQuiz([single]))).game;
    const { host, olena } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:sort', { wordId: 'w1', categoryId: 'c1' })).toEqual({ ok: false, error: 'type_mismatch' });
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
  it('player:wager takes an optional all-in flag', async () => {
    const game = (await startGame(ctx.app, makeRoundsQuiz([finalRound('f', single)]))).game;
    const { host, olena } = await lobby(game);
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('wager'));
    expect(await send(olena, 'player:wager', { amount: 0, allIn: 'yes' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:wager', { amount: 0, allIn: true })).toEqual({ ok: true });
    expect(await send(olena, 'player:wager', { amount: 0, allIn: false })).toEqual({ ok: true });
  });
});

describe('«Як грати» over sockets', () => {
  it('host:guide-skip is host-only and leaves the guide for the first round', async () => {
    const created = (await startGame(ctx.app, makeRoundsQuiz([classicRound('r1', [single])], { newcomers: true }))).game;
    const { host, stage, olena } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    const guided = await until(stage, inPhase('guide'));
    expect(guided.guide?.page).toBe(0);
    expect(await send(olena, 'host:guide-skip')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:guide-skip')).toEqual({ ok: true });
    await until(stage, inPhase('intro'));
  });
});

describe('clues over sockets', () => {
  const filler = (prefix: string) => [1, 2, 3].map((n) => ({ ...withId(single, `${prefix}${n}`), points: 100 * n }));
  const voiceBoard = () =>
    makeRoundsQuiz([
      boardRound('g1', [{ title: 'Люди', cells: [clues, ...filler('a').slice(0, 2)] }, { title: 'Міста', cells: filler('b') }, { title: 'Річки', cells: filler('c') }], { answerMode: 'voice' }),
    ]);
  const shown = (view: GameView) => (view.role === 'player' && view.question?.clues?.shown.length) || 0;

  it('host:clue opens the next clue on a voice cell and every phone sees it', async () => {
    const { host, olena } = await lobby((await startGame(ctx.app, voiceBoard())).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    expect(await send(host, 'host:pick', { cellId: clues.id })).toEqual({ ok: true });
    expect((await until(olena, (view) => shown(view) === 1)).phase).toBe('question');
    expect(await send(host, 'host:clue')).toEqual({ ok: true });
    await until(olena, (view) => shown(view) === 2);
  });

  it('host:clue: a player cannot send it; in a classic question it is wrong_phase; after the last clue — clues_done', async () => {
    const { host, olena } = await lobby((await startGame(ctx.app, voiceBoard())).game);
    await send(host, 'host:start');
    await send(host, 'host:next');
    await send(host, 'host:pick', { cellId: clues.id });
    await until(olena, (view) => shown(view) === 1);
    expect(await send(olena, 'host:clue')).toEqual({ ok: false, error: 'forbidden' });
    for (let k = 2; k <= clues.clues.length; k += 1) expect(await send(host, 'host:clue')).toEqual({ ok: true });
    expect(await send(host, 'host:clue')).toEqual({ ok: false, error: 'clues_done' });

    const classic = (await startGame(ctx.app, makeRoundsQuiz([classicRound('r1', [clues])]))).game;
    const second = await lobby(classic);
    await send(second.host, 'host:start');
    await send(second.host, 'host:next');
    await until(second.olena, inPhase('question'));
    expect(await send(second.host, 'host:clue')).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('audio over sockets', () => {
  type Command = { action: 'replay' | 'stop'; seq: number };
  const listen = (tracked: Tracked) => {
    const received: Command[] = [];
    tracked.socket.on('audio', (command) => received.push(command));
    return received;
  };
  const audioGame = async () =>
    (await startGame(ctx.app, makeQuiz([withAudio(single), text]))).game;
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('host:audio reaches the stage and the host, never the players', async () => {
    const { host, stage, olena, taras } = await lobby(await audioGame());
    const heard = { host: listen(host), stage: listen(stage), olena: listen(olena), taras: listen(taras) };
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));

    expect(await send(host, 'host:audio', { action: 'replay' })).toEqual({ ok: true });
    expect(await send(host, 'host:audio', { action: 'stop' })).toEqual({ ok: true });
    await pause(200);
    expect(heard.stage.map((c) => c.action)).toEqual(['replay', 'stop']);
    expect(heard.stage[1]!.seq).toBeGreaterThan(heard.stage[0]!.seq);
    expect(heard.host).toEqual(heard.stage);
    expect(heard.olena).toEqual([]);
    expect(heard.taras).toEqual([]);
  });

  it('host:audio outside an audio question is wrong_phase; a player cannot send it; a bad payload is invalid', async () => {
    const { host, stage, olena } = await lobby(await audioGame());
    expect(await send(host, 'host:audio', { action: 'replay' })).toEqual({ ok: false, error: 'wrong_phase' });
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'host:audio', { action: 'replay' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:audio', { action: 'replay' })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [undefined, {}, { action: 'play' }, { action: 1 }, 'replay']) {
      expect(await send(host, 'host:audio', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    // Вікторина без аудіо.
    const plain = await lobby();
    await send(plain.host, 'host:start');
    await send(plain.host, 'host:next');
    await until(plain.olena, inPhase('question'));
    expect(await send(plain.host, 'host:audio', { action: 'replay' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('does not touch the game clock', async () => {
    const { host, olena } = await lobby(await audioGame());
    await send(host, 'host:start');
    await send(host, 'host:next');
    const before = await until(olena, inPhase('question'));
    await send(host, 'host:audio', { action: 'replay' });
    await pause(100);
    expect(olena.last).toEqual(before);
  });

  it('the host learns whether the stage is open', async () => {
    const game = await createGame();
    const host = open({ code: game.code, role: 'host', token: game.hostToken });
    const stageOnline = (online: boolean) =>
      new Promise<void>((resolve) =>
        host.socket.on('state', (_view, meta) => {
          if (meta.stageOnline === online) resolve();
        }),
      );

    await stageOnline(false);
    const opened = stageOnline(true);
    const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
    await opened;

    const closed = stageOnline(false);
    stage.socket.close();
    await closed;
  });
});

describe('sort tilt over sockets (11d)', () => {
  const cardOf = (view: GameView | null) => (view?.role === 'player' ? (view.me.sort?.card?.id ?? null) : null);

  it('a board cell: everyone but the author gets the tilt', async () => {
    const filler = (prefix: string) => [1, 2, 3].map((n) => ({ ...withId(single, `${prefix}${n}`), points: 100 * n }));
    const board = makeRoundsQuiz([
      boardRound('g1', [
        { title: 'Сортування', cells: [{ answerMode: 'phone', question: sortQ }, ...filler('a').slice(0, 2)] },
        { title: 'Міста', cells: filler('b') },
        { title: 'Річки', cells: filler('c') },
      ]),
    ]);
    const { game, host, stage, olena, taras, olenaJoin, tarasJoin } = await lobby((await startGame(ctx.app, board)).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    expect(await send(host, 'host:pick', { cellId: sortQ.id })).toEqual({ ok: true });
    for (const who of [olena, taras, stage, host]) await until(who, inPhase('question'));
    const [chooser, other] = cardOf(olena.last) !== null ? [olena, taras] : [taras, olena];
    const wordId = cardOf(chooser.last);
    expect(wordId).not.toBeNull();
    const got = { host: listenTilt(host), stage: listenTilt(stage), chooser: listenTilt(chooser), other: listenTilt(other) };

    expect(await send(chooser, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: true });
    // Кругообіг підтвердження: усе, що сервер надіслав цим сокетам до нього, уже прийшло.
    expect(await send(other, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: false, error: 'not_your_turn' });
    expect(await send(stage, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [undefined, {}, { wordId, categoryId: 'c1', amount: 2 }, { wordId: 5, categoryId: 'c1', amount: 0.5 }, { wordId, amount: 0.5 }]) {
      expect(await send(chooser, 'player:sort-tilt', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    const tilt: SortTilt = { sorterId: (chooser === olena ? olenaJoin : tarasJoin).playerId, wordId: wordId!, toward: 'c1', amount: 0.7, seq: 0 };
    expect(got.stage).toEqual([tilt]);
    expect(got.host).toEqual([tilt]);
    expect(got.other).toEqual([tilt]);
    expect(got.chooser).toEqual([]);

    // Щойно підключений отримує нахил, що діє: палець стоїть, нового не буде; автор — ні.
    const late = { stage: open({ code: game.code, role: 'stage', token: game.stageToken }), chooser: open({ code: game.code, role: 'player', token: (chooser === olena ? olenaJoin : tarasJoin).token }) };
    const lateGot = { stage: listenTilt(late.stage), chooser: listenTilt(late.chooser) };
    for (const who of [late.stage, late.chooser]) await until(who, inPhase('question'));
    expect(await send(late.stage, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(late.chooser, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: true });
    expect(lateGot.stage).toEqual([tilt]);
    expect(lateGot.chooser).toEqual([]);
  });

  it('classic: refused with wrong_phase, nobody gets anything', async () => {
    const { host, stage, olena, taras } = await lobby((await startGame(ctx.app, makeQuiz([sortQ]))).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    for (const who of [olena, taras, stage, host]) await until(who, inPhase('question'));
    const got = [host, stage, olena, taras].map(listenTilt);
    const wordId = cardOf(olena.last);
    expect(wordId).not.toBeNull();
    expect(await send(olena, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 1 })).toEqual({ ok: false, error: 'wrong_phase' });
    for (const who of [taras, stage, host]) await send(who, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 1 });
    expect(got.flat()).toEqual([]);
  });
});

describe('survey over real sockets (10e)', () => {
  /** Класика зі «100 до 1»: Олена влучає в Яблуко й Полуницю, Тарас мовчить; дійшли до reveal. */
  async function toReveal() {
    const created = (await startGame(ctx.app, makeQuiz([survey, single]))).game;
    const lobbied = await lobby(created);
    const { host, stage, olena } = lobbied;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', { type: 'survey', values: ['яблучко', 'Полуниця'] })).toEqual({ ok: true });
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(stage, inPhase('reveal'));
    return lobbied;
  }

  it('host:survey-all opens every row on the stage', async () => {
    const { host, stage, olena } = await toReveal();
    const closed = await until(stage, (view) => view.phase === 'reveal' && view.survey !== null);
    expect(closed.survey?.rows.every((row) => !row.open)).toBe(true);
    expect(await send(olena, 'host:survey-all')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:survey-all')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:survey-all')).toEqual({ ok: true });
    const opened = await until(stage, (view) => view.survey?.rows.every((row) => row.open) === true);
    expect(opened.survey?.rows).toHaveLength(5);
    expect(opened.survey?.rows.map((row) => row.text)).toContain('Полуниця');
  });

  it('no socket frame to a phone or the stage carries survey rows before the reveal', async () => {
    const created = (await startGame(ctx.app, makeQuiz([survey, single]))).game;
    const { host, stage, olena, taras } = await lobby(created);
    const frames: string[] = [];
    for (const tracked of [stage, olena, taras]) tracked.socket.on('state', (view) => frames.push(JSON.stringify(view)));
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', { type: 'survey', values: ['Яблуко', 'ананас'] })).toEqual({ ok: true });
    await until(stage, (view) => view.phase === 'question');
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    await until(stage, inPhase('locked'));
    await until(olena, inPhase('locked'));
    expect(frames.length).toBeGreaterThan(0);
    const all = frames.join('\n');
    expect(all).not.toContain('Полуниця');
    expect(all).not.toContain('Кавун');
    expect(all).not.toContain('Банан');
    expect(all).not.toContain('Груша');
    expect(all).not.toMatch(/"popularity":\d/);
  });

  it('host:next steps survey rows before moving on', async () => {
    const { host, stage } = await toReveal();
    for (let i = 1; i <= 5; i += 1) {
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      const view = await until(stage, (v) => v.survey?.rows.filter((row) => row.open).length === i);
      expect(view.phase).toBe('reveal');
    }
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    const after = await until(stage, (view) => view.phase !== 'reveal');
    expect(after.phase).not.toBe('reveal');
  });
});

describe('wipeout over sockets (10g)', () => {
  const wipeoutGame = async () => {
    const created = (await startGame(ctx.app, makeRoundsQuiz([wipeoutRound('w', wipeoutLadder)]))).game;
    return lobby(created);
  };

  it('player:wipeout takes a decision in the window; it is player-only and checks the payload and the phase', async () => {
    const { host, stage, olena, taras } = await wipeoutGame();
    expect(await send(olena, 'player:wipeout', { take: true })).toEqual({ ok: false, error: 'wrong_phase' });
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', WIPEOUT_RIGHT[0])).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', WIPEOUT_RIGHT[0])).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    await send(host, 'host:next');
    await until(host, inPhase('reveal'));
    expect(await send(olena, 'player:wipeout', { take: true })).toEqual({ ok: false, error: 'wrong_phase' });
    await send(host, 'host:next');
    await until(olena, inPhase('leaderboard'));

    expect(await send(host, 'player:wipeout', { take: true })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:wipeout', { take: true })).toEqual({ ok: false, error: 'forbidden' });
    for (const take of ['yes', 1, undefined]) {
      expect(await send(olena, 'player:wipeout', { take })).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:wipeout')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:next')).toEqual({ ok: false, error: 'deciding' });
    expect(await send(olena, 'player:wipeout', { take: true })).toEqual({ ok: true });
    expect(await send(olena, 'player:wipeout', { take: false })).toEqual({ ok: false, error: 'already_answered' });
    expect(await send(taras, 'player:wipeout', { take: false })).toEqual({ ok: true });
    // Вирішили всі: вікно закрилося, ведучий іде далі.
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
  });
});


describe('ladder over sockets (10i)', () => {
  const ladderGame = async () => {
    const created = (await startGame(ctx.app, makeRoundsQuiz([ladderRound('rl')]))).game;
    return lobby(created);
  };

  it('host:ladder-pick chooses the contestant on the intro; it is host-only and checks the payload', async () => {
    const { host, olena, olenaJoin } = await ladderGame();
    await send(host, 'host:start');
    expect(await send(olena, 'host:ladder-pick', { playerId: olenaJoin.playerId })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:ladder-pick', {})).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:ladder-pick', { playerId: 'ghost' })).toEqual({ ok: false, error: 'not_found' });
    expect(await send(host, 'host:ladder-pick', { playerId: olenaJoin.playerId })).toEqual({ ok: true });
    const view = await until(olena, (v) => v.ladder?.contestant?.playerId === olenaJoin.playerId);
    expect(view.phase).toBe('intro');
  });

  it('player:lifeline takes a lifeline; it is player-only and checks the payload', async () => {
    const { host, stage, olena, taras, olenaJoin } = await ladderGame();
    await send(host, 'host:start');
    await send(host, 'host:ladder-pick', { playerId: olenaJoin.playerId });
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(host, 'player:lifeline', { kind: 'fifty' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:lifeline', { kind: 'fifty' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:lifeline', { kind: 'double' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:lifeline')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(taras, 'player:lifeline', { kind: 'fifty' })).toEqual({ ok: false, error: 'not_allowed' });
    // Без заставок (transitions вимкнено) запитання починається одразу — підказка береться.
    expect(await send(olena, 'player:lifeline', { kind: 'fifty' })).toEqual({ ok: true });
    const view = await until(olena, (v) => (v.ladder?.fifty?.length ?? 0) === 2);
    expect(view.ladder?.lifelines.find((l) => l.kind === 'fifty')?.state).toBe('active');
  });

  it('player:ladder and host:ladder-decide take the decision; a spectator cannot', async () => {
    const { host, olena, taras, olenaJoin } = await ladderGame();
    await send(host, 'host:start');
    await send(host, 'host:ladder-pick', { playerId: olenaJoin.playerId });
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:ladder', { take: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(olena, 'player:answer', LADDER_RIGHT[0])).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', LADDER_RIGHT[0])).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    await send(host, 'host:next');
    await until(host, inPhase('reveal'));
    await send(host, 'host:next');
    await until(olena, inPhase('leaderboard'));
    expect(await send(host, 'host:next')).toEqual({ ok: false, error: 'deciding' });
    expect(await send(taras, 'player:ladder', { take: true })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(olena, 'player:ladder', { take: 'yes' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'host:ladder-decide', { take: false })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:ladder', { take: false })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:ladder-decide', { take: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:ladder-decide', { take: false })).toEqual({ ok: true });
    expect(await send(olena, 'player:ladder', { take: true })).toEqual({ ok: false, error: 'already_answered' });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
  });
});

describe('survival over sockets (10h)', () => {
  /** Олена помилилася на s1, Тарас ні: до «Далі» на розкритті, відкрите випробування. */
  const survivalGame = async (trial: 'question' | 'luck') => {
    const created = (await startGame(ctx.app, makeRoundsQuiz([survivalRound('rs', survivalQuestions, survivalTrials, { trial })]))).game;
    const players = await lobby(created);
    const { host, olena, taras } = players;
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', SURVIVAL_WRONG[0])).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', SURVIVAL_RIGHT[0])).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    await send(host, 'host:next');
    await until(host, inPhase('reveal'));
    return players;
  };

  it('player:trial answers the survival question; it is player-only and checks the payload and the phase', async () => {
    const { host, stage, olena, taras } = await survivalGame('question');
    expect(await send(olena, 'player:trial', { answer: TRIAL_RIGHT[0] })).toEqual({ ok: false, error: 'wrong_phase' });
    await send(host, 'host:next');
    await until(olena, inPhase('leaderboard'));
    expect(await send(host, 'player:trial', { answer: TRIAL_RIGHT[0] })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:trial', { answer: TRIAL_RIGHT[0] })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:trial')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:trial', { answer: { type: 'nope' } })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:trial', TRIAL_RIGHT[0])).toEqual({ ok: false, error: 'invalid_payload' });
    // Тарас не на межі; двері в питанні — не та фаза.
    expect(await send(taras, 'player:trial', { answer: TRIAL_RIGHT[0] })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(olena, 'player:door', { door: 1 })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(olena, 'player:trial', { answer: TRIAL_WRONG[0] })).toEqual({ ok: true });
    expect(await send(olena, 'player:trial', { answer: TRIAL_RIGHT[0] })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('player:door picks a door in luck; door 3 is an invalid payload and the host and the stage are forbidden', async () => {
    const { host, stage, olena } = await survivalGame('luck');
    await send(host, 'host:next');
    await until(olena, inPhase('leaderboard'));
    for (const door of [3, -1, 1.5, '1', undefined]) {
      expect(await send(olena, 'player:door', { door })).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(host, 'player:door', { door: 1 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:door', { door: 1 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:trial', { answer: TRIAL_RIGHT[0] })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(olena, 'player:door', { door: 2 })).toEqual({ ok: true });
    expect(await send(olena, 'player:door', { door: 1 })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('teams over sockets (10j)', () => {
  /** Командна гра з ведучим, сценою й чотирма людьми в лобі; ids команд — зі зрізу пульта. */
  async function teamLobby(rounds = [classicRound('r1', [text, single])]) {
    const game = (await startGame(ctx.app, makeRoundsQuiz(rounds, { teams: defaultTeams(2) }))).game;
    const joins = [];
    for (const name of ['Олена', 'Тарас', 'Іра', 'Марко']) joins.push(await join(game.code, name));
    const host = open({ code: game.code, role: 'host', token: game.hostToken });
    const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
    const [olena, taras, ira, marko] = joins.map((j) => open({ code: game.code, role: 'player', token: j.token }));
    const view = await until(host, (v) => v.role === 'host' && (v.teams?.unassigned.filter((m) => m.connected).length ?? 0) === 4);
    const [red, blue] = (view.teams?.teams ?? []).map((t) => t.id);
    return { game, host, stage, olena, taras, ira, marko, joins, red, blue };
  }

  it('lobby events: player:team, player:team-roll, player:duelist, player:draft are player-only and validated', async () => {
    const { host, stage, olena, red } = await teamLobby();
    expect(await send(olena, 'player:team', { teamId: red })).toEqual({ ok: true });
    await until(host, (v) => v.role === 'host' && v.teams?.teams[0].members.length === 1);
    for (const payload of [undefined, { teamId: 5 }, { teamId: '' }]) {
      expect(await send(olena, 'player:team', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:team-roll')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(olena, 'player:duelist', { memberId: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:duelist', { memberId: 'm1' })).toEqual({ ok: false, error: 'wrong_phase' });
    for (const payload of [undefined, {}, { draft: { type: 'magic' } }]) {
      expect(await send(olena, 'player:draft', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(olena, 'player:draft', { draft: null })).toEqual({ ok: false, error: 'wrong_phase' });
    for (const who of [host, stage]) {
      expect(await send(who, 'player:team', { teamId: red })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:team-roll')).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:duelist', { memberId: 'm1' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:draft', { draft: null })).toEqual({ ok: false, error: 'forbidden' });
    }
  });

  it('host team events are host-only and validated', async () => {
    const { host, stage, olena, joins, red } = await teamLobby();
    const olenaId = joins[0].playerId;
    expect(await send(host, 'host:team-form', { form: 'dice' })).toEqual({ ok: true });
    expect(await send(host, 'host:team-form', { form: 'magic' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:team-dice')).toEqual({ ok: true });
    expect(await send(host, 'host:team-roll')).toEqual({ ok: true });
    expect(await send(host, 'host:team-form', { form: 'random' })).toEqual({ ok: true });
    expect(await send(host, 'host:team-deal')).toEqual({ ok: true });
    expect(await send(host, 'host:team-form', { form: 'host' })).toEqual({ ok: true });
    expect(await send(host, 'host:team-assign', { memberId: olenaId, teamId: red })).toEqual({ ok: true });
    expect(await send(host, 'host:team-assign', { memberId: olenaId, teamId: null })).toEqual({ ok: true });
    expect(await send(host, 'host:team-assign', { memberId: olenaId })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:team-assign', { memberId: olenaId, teamId: red })).toEqual({ ok: true });
    expect(await send(host, 'host:captain', { teamId: red, memberId: olenaId })).toEqual({ ok: true });
    expect(await send(host, 'host:captain', { teamId: red })).toEqual({ ok: false, error: 'invalid_payload' });
    for (const who of [olena, stage]) {
      expect(await send(who, 'host:team-form', { form: 'dice' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'host:team-assign', { memberId: olenaId, teamId: red })).toEqual({ ok: false, error: 'forbidden' });
      for (const event of ['host:team-deal', 'host:team-dice', 'host:team-roll']) {
        expect(await send(who, event)).toEqual({ ok: false, error: 'forbidden' });
      }
      expect(await send(who, 'host:captain', { teamId: red, memberId: olenaId })).toEqual({ ok: false, error: 'forbidden' });
    }
  });

  it('the captain draft reaches the teammates and the host: not the other team or the stage', async () => {
    const { host, stage, olena, taras, ira, marko, joins, red, blue } = await teamLobby();
    for (const [i, team] of [red, red, blue, blue].entries()) {
      expect(await send(host, 'host:team-assign', { memberId: joins[i].playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    for (const who of [olena, taras, ira, marko, stage, host]) await until(who, inPhase('question'));
    const counts = () => [olena, ira, marko, stage].map((who) => who.states);
    const before = counts();

    expect(await send(olena, 'player:draft', { draft: { type: 'text', value: 'Чернетка-Львів' } })).toEqual({ ok: true });
    const seen = await until(taras, (v) => v.role === 'player' && v.team?.draft !== null && v.team?.draft !== undefined);
    expect(seen.role === 'player' && seen.team?.draft).toEqual({ type: 'text', value: 'Чернетка-Львів' });
    // Пульт отримує свіжий зріз «Відповідей наживо» з чернеткою (11c).
    const hostSeen = await until(host, (v) => v.role === 'host' && v.live?.rows.some((r) => r.draft !== null) === true);
    expect(hostSeen.role === 'host' && hostSeen.live?.rows.find((r) => r.draft !== null)?.draft).toEqual({ type: 'text', value: 'Чернетка-Львів' });
    // Кругообіг підтвердження: усе, що сервер надіслав цим сокетам до нього, уже прийшло.
    expect(await send(marko, 'player:draft', { draft: null })).toEqual({ ok: false, error: 'not_captain' });
    expect(await send(ira, 'player:team', { teamId: red })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(stage, 'host:team-deal')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:team-deal')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(counts()).toEqual(before);
    for (const who of [olena, ira, marko, stage]) expect(JSON.stringify(who.last)).not.toContain('Чернетка-Львів');
  });

  it('sort tilt (11d): the captain tilt reaches the teammates and the host, not the other team, the stage or the captain', async () => {
    const { host, stage, olena, taras, ira, marko, joins, red, blue } = await teamLobby([classicRound('r1', [sortQ])]);
    for (const [i, team] of [red, red, blue, blue].entries()) {
      expect(await send(host, 'host:team-assign', { memberId: joins[i].playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    for (const who of [olena, taras, ira, marko, stage, host]) await until(who, inPhase('question'));
    const got = { host: listenTilt(host), stage: listenTilt(stage), olena: listenTilt(olena), taras: listenTilt(taras), ira: listenTilt(ira), marko: listenTilt(marko) };
    const view = olena.last;
    const wordId = view?.role === 'player' ? view.me.sort?.card?.id : undefined;
    expect(wordId).toBeDefined();

    expect(await send(olena, 'player:sort-tilt', { wordId, categoryId: 'c2', amount: 0.4 })).toEqual({ ok: true });
    expect(await send(taras, 'player:sort-tilt', { wordId, categoryId: 'c2', amount: 0.4 })).toEqual({ ok: false, error: 'not_captain' });
    // Кругообіг підтвердження: усе, що сервер надіслав цим сокетам до нього, уже прийшло.
    expect(await send(ira, 'player:sort-tilt', { wordId, categoryId: 'c2', amount: 0.4 })).toEqual({ ok: true });
    for (const who of [marko, stage, host]) await send(who, 'player:sort-tilt', { wordId, categoryId: 'c2', amount: 0.4 });
    const tilt: SortTilt = { sorterId: red, wordId: wordId!, toward: 'c2', amount: 0.4, seq: 0 };
    expect(got.taras).toEqual([tilt]);
    expect(got.host).toContainEqual(tilt);
    expect(got.olena).toEqual([]);
    expect(got.stage).toEqual([]);
    // Сині отримують лише нахил власного капітана Іри, а не червоних.
    expect(got.marko.every((t) => t.sorterId === blue)).toBe(true);
    expect(got.ira).toEqual([]);
  });
});

describe('autopilot sockets (11g)', () => {
  async function autopilotRoom(quiz: object = makeQuiz([single, text])) {
    const account = await signUp(ctx.app, 'Марта');
    const saved = await ctx.app.inject({ method: 'POST', url: '/api/quizzes', payload: quiz, headers: { cookie: account.cookie } });
    const { id: quizId } = saved.json() as { id: string };
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/games',
      payload: { quizId, autopilot: true, nickname: 'Марта' },
      headers: { cookie: account.cookie },
    });
    const game = created.json() as { code: string; token: string; playerId: string; stageToken: string };
    const other = await join(game.code, 'Тарас');
    const frames: string[] = [];
    const metas: boolean[] = [];
    const author = open({ code: game.code, role: 'player', token: game.token });
    const taras = open({ code: game.code, role: 'player', token: other.token });
    const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
    for (const t of [author, taras, stage]) {
      t.socket.on('state', (view, meta) => {
        frames.push(JSON.stringify(view));
        metas.push(meta.hostOnline);
      });
    }
    await until(stage, (view) => view.role === 'stage' && view.phase === 'lobby' && JSON.stringify(view).includes('Тарас'));
    await until(taras, (view) => view.role === 'player');
    await until(stage, (view) => view.role === 'stage');
    return { game, author, taras, stage, other, frames, metas };
  }

  it('refuses a host socket, whatever the token', async () => {
    const { game } = await autopilotRoom();
    // Зокрема справжній hostToken кімнати: він ніде не видається, але й не відкриває пульта.
    const real = ctx.manager.get(game.code)!.hostToken;
    for (const token of ['nope', 'x'.repeat(40), real]) {
      const socket: Client = connect(url, { auth: { code: game.code, role: 'host', token }, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
      expect(error.message).toBe('unauthorized');
    }
  });

  it('lets only the author run author actions from the phone', async () => {
    const { author, taras, stage, other } = await autopilotRoom();
    expect(await send(taras, 'host:start')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(stage, 'host:start')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(author, 'host:next')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:adjust', { playerId: other.playerId, points: 50 })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:undo', { target: { seq: 1 } })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:audio', { action: 'replay' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:time', { seconds: 15 })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:kick', { player: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(taras, 'host:kick', { playerId: other.playerId })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:start')).toEqual({ ok: true });
    await until(taras, (view) => view.phase !== 'lobby');
  });

  it('lets the author kick another player but not themselves', async () => {
    const { game, author, taras, other } = await autopilotRoom();
    const closed = new Promise<string>((resolve) => taras.socket.on('closed', resolve));
    expect(await send(author, 'host:kick', { playerId: game.playerId })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:kick', { playerId: other.playerId })).toEqual({ ok: true });
    expect(await closed).toBe('kicked');
    // Старий токен вилученого більше не пускає.
    const again: Client = connect(url, { auth: { code: game.code, role: 'player', token: other.token }, transports: ['websocket'], reconnection: false });
    sockets.push(again);
    const error = await new Promise<Error>((resolve) => again.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('the author who reconnects keeps the author actions', async () => {
    const { game, author, taras } = await autopilotRoom();
    expect(await send(author, 'host:start')).toEqual({ ok: true });
    await until(taras, (view) => view.phase !== 'lobby');
    const gone = new Promise<void>((resolve) => author.socket.on('disconnect', () => resolve()));
    author.socket.close();
    await gone;
    const back = open({ code: game.code, role: 'player', token: game.token });
    await until(back, (view) => view.role === 'player' && view.phase !== 'lobby');
    expect(await send(back, 'host:pause')).toEqual({ ok: true });
    await until(taras, (view) => view.paused);
    expect(await send(taras, 'host:resume')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(back, 'host:resume')).toEqual({ ok: true });
  });

  it('a team game: the author member starts it, a member of the other team may not', async () => {
    const { author, taras } = await autopilotRoom(makeRoundsQuiz([classicRound('r1', [single, text])], { teams: defaultTeams(2) }));
    expect(await send(taras, 'host:start')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:start')).toEqual({ ok: true });
    const view = await until(taras, (v) => v.phase !== 'lobby');
    expect(view.role === 'player' && view.team?.teamId).toBeTruthy();
    expect(await send(taras, 'host:pause')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:pause')).toEqual({ ok: true });
  });

  it('shows no host in any frame and reports the host as online', async () => {
    const { author, taras, frames, metas } = await autopilotRoom();
    await send(author, 'host:start');
    await until(taras, (view) => view.phase !== 'lobby');
    const view = await until(author, (v) => v.phase !== 'lobby');
    expect(view.autopilot).toBe(true);
    expect(frames.length).toBeGreaterThan(3);
    expect(metas.every(Boolean)).toBe(true);
    for (const frame of frames) {
      expect(frame).not.toContain('"role":"host"');
      expect(frame).not.toContain('"live":{');
      expect(frame).not.toContain('"responses":');
    }
  });

  it('keeps forbidden for players of an ordinary room', async () => {
    const { olena } = await lobby();
    expect(await send(olena, 'host:start')).toEqual({ ok: false, error: 'forbidden' });
  });
});
