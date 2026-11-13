import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { auctionRound, betsRound, bluff, blitzRound, boardRound, bool, chain, classicRound, clues, cloud, duels, finalRound, makeQuiz, multi, makeRoundsQuiz, single, sortQ, survey, survivalQuestions, survivalRound, survivalTrials, text, wall, withAudio, withId, wipeoutLadder, wipeoutRound, ladderRound, letterwords, moreless, drawing, timedlist, truthRound, wordladder, puzzlesQuiz, sudoku, jigsaw, jigsawQuiz, spotdiff, spotdiffQuiz, memoryQuiz, melodyQuiz, questQuiz } from '@quiz/engine/testing';
import { DEFAULT_RULES, defaultTeams, memoryLayout, STICKERS, SPLASH_MS, type AckResult, type ClientToServerEvents, type DrawingEvent, type GameView, type HostDrafts, type Reaction, type ServerToClientEvents, type SocketAuth, type SortTilt } from '@quiz/shared';
import { eq, inArray } from 'drizzle-orm';
import { buildApp } from './app';
import { answer, appeal, scoreAdjustment } from './db/schema';
import type { Db } from './db/client';
import { TEST_AUTH, signUp, startGame, type StartedGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { FakeScheduler } from './testing/fake-scheduler';
import { SURVIVAL_RIGHT, SURVIVAL_WRONG, TRIAL_RIGHT, TRIAL_WRONG } from './testing/survival-game';
import { LADDER_RIGHT } from './testing/ladder-game';
import { WIPEOUT_RIGHT } from './testing/wipeout-game';
import { nounsOf } from './wordladder/nouns';
import { rateOf } from './rooms/manager';

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

/** Збирає події малюнка (28c), що прийшли сокету. */
function listenDrawing(tracked: Tracked): DrawingEvent[] {
  const received: DrawingEvent[] = [];
  tracked.socket.on('drawing', (event) => received.push(event));
  return received;
}

/** Збирає пакети живих виборів (12b), що прийшли сокету. */
function listenDrafts(tracked: Tracked): HostDrafts[] {
  const received: HostDrafts[] = [];
  tracked.socket.on('host:drafts', (batch) => received.push(batch));
  return received;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe('host:start with resume (12r)', () => {
  const twoRounds = () => makeRoundsQuiz([classicRound('r0', [single]), classicRound('r1', [withId(single, 'q2')])]);

  it('starts as before without a payload', async () => {
    const { host } = await lobby();
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    await until(host, inPhase('intro'));
  });

  it('a null payload is a plain start', async () => {
    const { host } = await lobby((await startGame(ctx.app, twoRounds())).game);
    expect(await send(host, 'host:start', null)).toEqual({ ok: true });
    const view = await until(host, inPhase('intro'));
    expect(view.round?.index).toBe(0);
  });

  it('starts at the chosen round with the carried points', async () => {
    const { host, olenaJoin } = await lobby((await startGame(ctx.app, twoRounds())).game);
    expect(await send(host, 'host:start', { resume: { roundIndex: 1, points: { [olenaJoin.playerId]: 42434 } } })).toEqual({ ok: true });
    const view = await until(host, inPhase('intro'));
    expect(view.round?.index).toBe(1);
    expect(view.role === 'host' && view.players.find((p) => p.id === olenaJoin.playerId)?.score).toBe(42434);
  });

  it('refuses a malformed payload, a player in a hosted game and an engine check', async () => {
    const { host, olena, olenaJoin } = await lobby((await startGame(ctx.app, twoRounds())).game);
    expect(await send(host, 'host:start', { resume: { roundIndex: 0, points: { [olenaJoin.playerId]: 1.5 } } })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:start', { resume: { roundIndex: 0, points: {} }, extra: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:start', 'x')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'host:start', { resume: { roundIndex: 1, points: {} } })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:start', { resume: { roundIndex: 5, points: {} } })).toEqual({ ok: false, error: 'resume_invalid' });
    expect(await send(host, 'host:start', { resume: { roundIndex: 0, points: { stranger: 5 } } })).toEqual({ ok: false, error: 'not_found' });
    expect(await send(host, 'host:start', { resume: { roundIndex: 0, points: {} } })).toEqual({ ok: true });
    expect(await send(host, 'host:start')).toEqual({ ok: false, error: 'wrong_phase' });
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

describe('freeing a slot of a continued game over sockets (13b)', () => {
  /** Збережена гра з Оленою й Тарасом, продовжена точно; Тарас зайняв своє місце й на зв'язку. */
  async function continuedGame() {
    const created = await createGame();
    const olenaJoin = await join(created.code, 'Олена');
    const tarasJoin = await join(created.code, 'Тарас');
    const room = ctx.manager.get(created.code)!;
    let saved: Parameters<typeof ctx.manager.continueSaved>[2] | undefined;
    const off = ctx.manager.onEvent((_room, event) => {
      if (event.type === 'closed' && event.saved !== undefined) saved = event.saved;
    });
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(ctx.manager.host(room, { type: 'save' })).toEqual({ ok: true });
    off();
    const result = ctx.manager.continueSaved(room.id, room.hostUserId!, saved!);
    if (!result.ok) throw new Error(result.error);
    const next = result.room;
    const claimed = ctx.manager.claim(next.code, tarasJoin.playerId, null);
    if (!claimed.ok) throw new Error(claimed.error);
    const host = open({ code: next.code, role: 'host', token: next.hostToken });
    const taras = open({ code: next.code, role: 'player', token: claimed.token });
    await until(host, (view) => view.role === 'host' && view.players.some((p) => p.id === tarasJoin.playerId && p.connected));
    return { host, taras, tarasId: tarasJoin.playerId, olenaId: olenaJoin.playerId };
  }

  it('host:release sends «released» to the phone of the freed slot', async () => {
    const { host, taras, tarasId } = await continuedGame();
    const closed = new Promise<string>((resolve) => taras.socket.on('closed', resolve));
    expect(await send(host, 'host:release', { player: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:release', { playerId: tarasId })).toEqual({ ok: true });
    expect(await closed).toBe('released');
  });

  it('a player of a game with a host cannot free a slot', async () => {
    const { taras, olenaId } = await continuedGame();
    expect(await send(taras, 'host:release', { playerId: olenaId })).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('saving a game over sockets (13b)', () => {
  it('host:save closes the room for the phones and the stage with «saved»', async () => {
    const { host, stage, olena } = await lobby();
    await send(host, 'host:start');
    await until(olena, inPhase('intro'));
    const phone = new Promise<string>((resolve) => olena.socket.on('closed', resolve));
    const screen = new Promise<string>((resolve) => stage.socket.on('closed', resolve));
    const desk = new Promise<string>((resolve) => host.socket.on('closed', resolve));
    expect(await send(host, 'host:save')).toEqual({ ok: true });
    expect(await phone).toBe('saved');
    expect(await screen).toBe('saved');
    expect(await desk).toBe('saved');
  });

  it('a phone cannot save a hosted game', async () => {
    const { host, olena } = await lobby();
    await send(host, 'host:start');
    await until(olena, inPhase('intro'));
    expect(await send(olena, 'host:save')).toEqual({ ok: false, error: 'forbidden' });
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
  it('player:wordladder and player:wordladder-back are player-only and validated', async () => {
    // Свій крихітний словник замість справжнього файла.
    await ctx.app.close();
    ctx = await buildApp({ db, auth: TEST_AUTH, nouns: nounsOf(['пила']) });
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const created = (await startGame(ctx.app, makeQuiz([wordladder]))).game;
    const { host, stage, olena } = await lobby(created);
    for (const who of [host, stage]) {
      expect(await send(who, 'player:wordladder', { word: 'пола' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:wordladder-back')).toEqual({ ok: false, error: 'forbidden' });
    }
    for (const payload of [{ word: 5 }, { word: 'а'.repeat(31) }, undefined]) {
      expect(await send(olena, 'player:wordladder', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));

    expect(await send(olena, 'player:wordladder', { word: 'Пола' })).toEqual({ ok: true });
    expect(await send(olena, 'player:wordladder', { word: 'пила' })).toEqual({ ok: true });
    expect(await send(olena, 'player:wordladder', { word: 'тара' })).toEqual({ ok: false, error: 'word_one_letter' });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.wordladder?.words.length === 2);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.me.wordladder?.words).toEqual(['пола', 'пила']);
    expect(await send(olena, 'player:wordladder-back')).toEqual({ ok: true });
    expect(await send(olena, 'player:wordladder-back')).toEqual({ ok: true });
    expect(await send(olena, 'player:wordladder-back')).toEqual({ ok: false, error: 'word_none' });
  });

  it('player:list is player-only and validated', async () => {
    const created = (await startGame(ctx.app, makeQuiz([timedlist]))).game;
    const { host, stage, olena } = await lobby(created);
    for (const who of [host, stage]) {
      expect(await send(who, 'player:list', { word: 'Марс', enter: true })).toEqual({ ok: false, error: 'forbidden' });
    }
    for (const payload of [{ word: 5, enter: true }, { word: 'а'.repeat(61), enter: true }, { word: 'Марс' }, undefined]) {
      expect(await send(olena, 'player:list', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));

    expect(await send(olena, 'player:list', { word: 'Марс', enter: false })).toEqual({ ok: true });
    expect(await send(olena, 'player:list', { word: 'марс', enter: true })).toEqual({ ok: false, error: 'list_repeat', index: 4 });
    expect(await send(olena, 'player:list', { word: 'Плутон', enter: true })).toEqual({ ok: false, error: 'list_miss' });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.timedlist?.wrong === 1);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.me.timedlist?.found).toEqual([{ index: 4, text: 'Марс' }]);
  });

  it('player:letters is player-only and validated', async () => {
    await ctx.app.close();
    ctx = await buildApp({ db, auth: TEST_AUTH, nouns: nounsOf(['морква', 'кіт']) });
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const created = (await startGame(ctx.app, makeQuiz([letterwords]))).game;
    const { host, stage, olena } = await lobby(created);
    for (const who of [host, stage]) expect(await send(who, 'player:letters', { word: 'кіт' })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [{ word: 5 }, { word: 'а'.repeat(31) }, {}, undefined]) {
      expect(await send(olena, 'player:letters', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));

    expect(await send(olena, 'player:letters', { word: 'Морква' })).toEqual({ ok: true });
    expect(await send(olena, 'player:letters', { word: 'морква' })).toEqual({ ok: false, error: 'letters_repeat' });
    expect(await send(olena, 'player:letters', { word: 'ром' })).toEqual({ ok: false, error: 'word_unknown' });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.letterwords?.words.length === 1);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.me.letterwords?.words).toEqual([{ text: 'морква', letters: 6 }]);
  });

  it('player:moreless is player-only and validated', async () => {
    const created = (await startGame(ctx.app, makeQuiz([moreless]))).game;
    const { host, stage, olena } = await lobby(created);
    for (const who of [host, stage]) expect(await send(who, 'player:moreless', { index: 0, pick: 'a' })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [{ index: -1, pick: 'a' }, { index: 0, pick: 'c' }, { index: 0 }, { index: 1.5, pick: 'a' }, undefined]) {
      expect(await send(olena, 'player:moreless', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));

    expect(await send(olena, 'player:moreless', { index: 0, pick: 'a' })).toEqual({ ok: true });
    expect(await send(olena, 'player:moreless', { index: 0, pick: 'b' })).toEqual({ ok: false, error: 'moreless_stale', index: 1 });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.moreless?.done === 1);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.me.moreless?.picks).toEqual(['a']);
  });

  it('fills a grid through the socket', async () => {
    const created = (await startGame(ctx.app, puzzlesQuiz())).game;
    const { host, stage, olena, taras } = await lobby(created);
    const cell = sudoku.givens.indexOf('0');
    const digit = sudoku.solution[cell];
    const other = String((Number(digit) % 6) + 1);
    for (const who of [host, stage]) {
      expect(await send(who, 'player:puzzle', { questionIndex: 0, cells: [{ i: cell, v: digit }] })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:puzzle-done', { questionIndex: 0 })).toEqual({ ok: false, error: 'forbidden' });
    }
    const bad = [
      { questionIndex: 0, cells: [] },
      { questionIndex: 0, cells: [{ i: 144, v: '1' }] },
      { questionIndex: 0, cells: [{ i: 0, v: '123' }] },
      { questionIndex: 0, cells: Array.from({ length: 13 }, (_, i) => ({ i, v: '1' })) },
      { questionIndex: -1, cells: [{ i: 0, v: '1' }] },
      { questionIndex: 0, cells: [{ i: 0, v: '1', x: 1 }] },
      undefined,
    ];
    for (const payload of bad) expect(await send(olena, 'player:puzzle', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    for (const payload of [{}, { questionIndex: 'a' }, undefined]) expect(await send(olena, 'player:puzzle-done', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));

    // Ack однаковий для правильної й хибної цифри.
    expect(JSON.stringify(await send(olena, 'player:puzzle', { questionIndex: 0, cells: [{ i: cell, v: digit }] }))).toBe('{"ok":true}');
    expect(JSON.stringify(await send(taras, 'player:puzzle', { questionIndex: 0, cells: [{ i: cell, v: other }] }))).toBe('{"ok":true}');
    const phone = await until(olena, (view) => view.role === 'player' && view.me.puzzle?.seq === 1);
    if (phone.role !== 'player') throw new Error('not a player');
    expect(phone.me.puzzle?.cells[cell]).toBe(digit);
    // Зрізи від пакетів зливаються (замикальне вікно), тож чекаємо на обидві маски.
    const shown = await until(stage, (view) => (view.puzzle?.boards.length ?? 0) === 2 && view.puzzle?.boards.every((b) => b.mask[cell] === '1') === true);
    expect(shown.puzzle?.boards.every((b) => b.cells === null)).toBe(true);
    expect(shown.puzzle?.solution).toBeNull();
    expect(await send(olena, 'player:puzzle-done', { questionIndex: 0 })).toEqual({ ok: true });
    expect(await send(olena, 'player:puzzle', { questionIndex: 0, cells: [{ i: cell, v: '' }] })).toEqual({ ok: false, error: 'puzzle_done' });
  });

  it('grid batches reach the room at most once per window, done goes out at once', async () => {
    const created = (await startGame(ctx.app, puzzlesQuiz())).game;
    const { host, stage, olena } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(stage, inPhase('question'));
    await until(olena, inPhase('question'));
    await pause(300);
    const empty = [...sudoku.givens].flatMap((v, i) => (v === '0' ? [i] : [])).slice(0, 5);
    const before = stage.states;
    for (const i of empty) expect(await send(olena, 'player:puzzle', { questionIndex: 0, cells: [{ i, v: sudoku.solution[i] }] })).toEqual({ ok: true });
    // П'ять пакетів поспіль: перший зріз одразу, решта — один замикальний з найсвіжішим станом.
    const shown = await until(stage, (view) => empty.every((i) => view.puzzle?.boards[0]?.mask[i] === '1'));
    await pause(400);
    expect(stage.states - before).toBeLessThanOrEqual(2);
    expect(shown.puzzle?.boards[0]?.cells).toBeNull();
    // «Готово» — без затримки, навіть одразу після пакета.
    expect(await send(olena, 'player:puzzle', { questionIndex: 0, cells: [{ i: empty[0], v: '' }] })).toEqual({ ok: true });
    const started = Date.now();
    expect(await send(olena, 'player:puzzle-done', { questionIndex: 0 })).toEqual({ ok: true });
    const done = await until(stage, (view) => view.puzzle?.boards[0]?.done === true);
    expect(Date.now() - started).toBeLessThan(150);
    // Відкладений зріз злився з негайним: стерта клітинка вже порожня.
    expect(done.puzzle?.boards[0]?.mask[empty[0]]).not.toBe('1');
  });

  /** «Пазл» (29c) після першого раунду: номер у раунді 0, state.questionIndex 1. */
  async function toJigsaw() {
    const created = (await startGame(ctx.app, jigsawQuiz())).game;
    const rig = await lobby(created);
    const { host, stage, olena, taras } = rig;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    while ((await until(olena, () => true)) && !(olena.last?.phase === 'question' && olena.last.role === 'player' && olena.last.question?.jigsaw !== undefined)) {
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      await pause(30);
    }
    await until(stage, (view) => view.phase === 'question');
    await pause(300);
    return { ...rig, olena, taras };
  }
  const spot = (piece: number) => ({ piece, x: piece % jigsaw.cols, y: Math.floor(piece / jigsaw.cols), rot: 0 });

  it('places through the socket after a classic round', async () => {
    const { stage, olena } = await toJigsaw();
    const phone = olena.last;
    if (phone?.role !== 'player') throw new Error('not a player');
    expect(phone.questionIndex).toBe(0);
    expect(await send(olena, 'player:jigsaw', { questionIndex: 1, ...spot(0) })).toEqual({ ok: false, error: 'jigsaw_stale' });
    expect(await send(olena, 'player:jigsaw', { questionIndex: phone.questionIndex, ...spot(0) })).toEqual({ ok: true });
    const shown = await until(stage, (view) => view.jigsaw?.boards[0]?.placed.length === 1);
    expect(shown.jigsaw?.boards.find((b) => b.nickname === 'Олена')?.placed).toEqual([0]);
    expect(await send(olena, 'player:jigsaw', { questionIndex: 0, piece: 40, x: 0, y: 0, rot: 0 })).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('jigsaw events are player-only', async () => {
    const { host, stage } = await toJigsaw();
    for (const who of [host, stage]) {
      expect(await send(who, 'player:jigsaw', { questionIndex: 0, ...spot(0) })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:jigsaw-hold', { questionIndex: 0, piece: 0 })).toEqual({ ok: false, error: 'forbidden' });
    }
  });

  it('jigsaw moves are rate limited', async () => {
    const { olena } = await toJigsaw();
    for (let k = 0; k < 8; k++) expect(await send(olena, 'player:jigsaw', { questionIndex: 0, ...spot(k) })).toEqual({ ok: true });
    expect(await send(olena, 'player:jigsaw', { questionIndex: 0, ...spot(8) })).toEqual({ ok: false, error: 'too_soon' });
    await pause(1100);
    expect(await send(olena, 'player:jigsaw', { questionIndex: 0, ...spot(8) })).toEqual({ ok: true });
  });

  it('moves merge stage pushes, the finish goes out at once', async () => {
    const { stage, olena } = await toJigsaw();
    const before = stage.states;
    for (let k = 0; k < 3; k++) expect(await send(olena, 'player:jigsaw', { questionIndex: 0, ...spot(k) })).toEqual({ ok: true });
    await until(stage, (view) => view.jigsaw?.boards.some((b) => b.placed.length === 3) === true);
    await pause(400);
    expect(stage.states - before).toBeLessThanOrEqual(2);
    await pause(1000);
    for (let k = 3; k < 11; k++) expect(await send(olena, 'player:jigsaw', { questionIndex: 0, ...spot(k) })).toEqual({ ok: true });
    await pause(1000);
    const started = Date.now();
    expect(await send(olena, 'player:jigsaw', { questionIndex: 0, ...spot(11) })).toEqual({ ok: true });
    await until(stage, (view) => view.jigsaw?.boards.some((b) => b.done) === true);
    expect(Date.now() - started).toBeLessThan(150);
  });

  /** «Знайди відмінності» (29d) після першого раунду: номер у раунді 0, state.questionIndex 1. */
  async function toSpotdiff() {
    const created = (await startGame(ctx.app, spotdiffQuiz())).game;
    const rig = await lobby(created);
    const { host, stage, olena, taras } = rig;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    while ((await until(olena, () => true)) && !(olena.last?.phase === 'question' && olena.last.role === 'player' && olena.last.question?.spotdiff !== undefined)) {
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      await pause(30);
    }
    await until(stage, (view) => view.phase === 'question');
    await pause(300);
    return { ...rig, olena, taras };
  }
  const tapSpot = (index: number, questionIndex = 0) => ({ questionIndex, x: spotdiff.spots[index].x, y: spotdiff.spots[index].y, width: 400 });
  const tapMiss = { questionIndex: 0, x: 0.95, y: 0.05, width: 400 };

  it('taps through the socket after a classic round', async () => {
    const { stage, olena } = await toSpotdiff();
    const phone = olena.last;
    if (phone?.role !== 'player') throw new Error('not a player view');
    expect(phone.questionIndex).toBe(0);
    expect(await send(olena, 'player:spotdiff', tapSpot(0, 1))).toEqual({ ok: false, error: 'spotdiff_stale' });
    expect(await send(olena, 'player:spotdiff', tapSpot(0, phone.questionIndex))).toEqual({ ok: true });
    const shown = await until(stage, (view) => view.spotdiff?.boards.some((b) => b.found === 1) === true);
    expect(shown.spotdiff?.boards.find((b) => b.nickname === 'Олена')?.found).toBe(1);
    expect(await send(olena, 'player:spotdiff', { ...tapSpot(1), width: 10 })).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('spotdiff events are player-only', async () => {
    const { host, stage } = await toSpotdiff();
    for (const who of [host, stage]) expect(await send(who, 'player:spotdiff', tapSpot(0))).toEqual({ ok: false, error: 'forbidden' });
  });

  it('a miss answers spotdiff_miss, three in a row freeze, and the freeze is kept', async () => {
    const { olena } = await toSpotdiff();
    expect(await send(olena, 'player:spotdiff', tapMiss)).toEqual({ ok: false, error: 'spotdiff_miss' });
    expect(await send(olena, 'player:spotdiff', tapMiss)).toEqual({ ok: false, error: 'spotdiff_miss' });
    expect(await send(olena, 'player:spotdiff', tapMiss)).toEqual({ ok: false, error: 'spotdiff_freeze' });
    expect(await send(olena, 'player:spotdiff', tapSpot(0))).toEqual({ ok: false, error: 'spotdiff_frozen' });
    await pause(1100);
    expect(await send(olena, 'player:spotdiff', tapSpot(0))).toEqual({ ok: true });
  });

  it('spotdiff taps are rate limited', async () => {
    const { olena } = await toSpotdiff();
    for (let k = 0; k < 6; k++) expect((await send(olena, 'player:spotdiff', tapMiss)).ok).toBe(false);
    expect(await send(olena, 'player:spotdiff', tapMiss)).toEqual({ ok: false, error: 'too_soon' });
    await pause(1100);
    expect(await send(olena, 'player:spotdiff', tapSpot(0))).toEqual({ ok: true });
  });

  it('a hit goes out at once', async () => {
    const { stage, olena } = await toSpotdiff();
    await send(olena, 'player:spotdiff', tapMiss);
    const started = Date.now();
    expect(await send(olena, 'player:spotdiff', tapSpot(0))).toEqual({ ok: true });
    await until(stage, (view) => view.spotdiff?.boards.some((b) => b.found === 1) === true);
    expect(Date.now() - started).toBeLessThan(150);
  });

  /** «Пам'ять» (29f) після першого раунду: номер у раунді 0, state.questionIndex 1. */
  async function toMemory() {
    const created = (await startGame(ctx.app, memoryQuiz())).game;
    const rig = await lobby(created);
    const { host, stage, olena, taras } = rig;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    while ((await until(olena, () => true)) && !(olena.last?.phase === 'question' && olena.last.role === 'player' && olena.last.question?.memory !== undefined)) {
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      await pause(30);
    }
    await until(stage, (view) => view.phase === 'question');
    await pause(300);
    return { ...rig, olena, taras };
  }
  const memoryLayout42 = memoryLayout(6, 42);

  it('memory flips through the socket after a classic round', async () => {
    const { olena } = await toMemory();
    const phone = olena.last;
    if (phone?.role !== 'player') throw new Error('not a player view');
    expect(phone.questionIndex).toBe(0);
    const cell = memoryLayout42.indexOf(0);
    expect(await send(olena, 'player:memory', { questionIndex: 1, cell })).toEqual({ ok: false, error: 'memory_stale' });
    expect(await send(olena, 'player:memory', { questionIndex: phone.questionIndex, cell })).toEqual({ ok: true });
    const shown = await until(olena, (view) => view.role === 'player' && view.me.memory?.cells[cell] != null);
    expect(shown.role === 'player' ? shown.me.memory?.cells[cell] : null).toMatchObject({ state: 'open', text: 'Україна' });
    expect(await send(olena, 'player:memory', { questionIndex: 0, cell: 20 })).toEqual({ ok: false, error: 'invalid_payload' });
  });

  /** «Мелодія» (29e) після першого раунду: номер у раунді 0, state.questionIndex 1. */
  async function toMelody() {
    const created = (await startGame(ctx.app, melodyQuiz())).game;
    const rig = await lobby(created);
    const { host, stage, olena } = rig;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    while ((await until(olena, () => true)) && !(olena.last?.phase === 'question' && olena.last.role === 'player' && olena.last.question?.melody !== undefined)) {
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      await pause(30);
    }
    await until(stage, (view) => view.phase === 'question');
    await pause(SPLASH_MS.question + 100);
    return rig;
  }

  it('opens melody chunks through the socket after a classic round', async () => {
    const { olena, stage } = await toMelody();
    const phone = olena.last;
    if (phone?.role !== 'player') throw new Error('not a player view');
    expect(phone.questionIndex).toBe(0);
    expect(await send(olena, 'player:melody', { questionIndex: 1, step: 1 })).toEqual({ ok: false, error: 'melody_stale' });
    expect(await send(olena, 'player:melody', { questionIndex: 0, step: 7 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:melody', { questionIndex: 0, step: 1 })).toEqual({ ok: true });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.melody?.heard === 1);
    expect(mine.role === 'player' ? mine.me.melody : null).toMatchObject({ heard: 1, canAnswer: true });
    const seen = await until(stage, (view) => view.melody?.rows.some((row) => row.heard === 1) === true);
    expect(seen.melody?.rows.find((row) => row.nickname === 'Олена')).toMatchObject({ heard: 1, answered: false });
  });

  it('a repeated melody chunk sends no new view', async () => {
    const { olena } = await toMelody();
    expect(await send(olena, 'player:melody', { questionIndex: 0, step: 1 })).toEqual({ ok: true });
    await until(olena, (view) => view.role === 'player' && view.me.melody?.heard === 1);
    await pause(50);
    const frames: unknown[] = [];
    olena.socket.onAny((...args) => frames.push(args));
    expect(await send(olena, 'player:melody', { questionIndex: 0, step: 1 })).toEqual({ ok: true });
    await pause(100);
    expect(frames).toEqual([]);
  });

  it('a melody answer through the socket pays by the chunk', async () => {
    const { olena, taras } = await toMelody();
    for (const step of [1, 2, 3]) expect(await send(olena, 'player:melody', { questionIndex: 0, step })).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', { type: 'melody', value: 'Щедрик' })).toEqual({ ok: false, error: 'melody_unheard' });
    expect(await send(olena, 'player:answer', { type: 'melody', value: 'Щедрик' })).toEqual({ ok: true });
    expect(await send(olena, 'player:melody', { questionIndex: 0, step: 4 })).toEqual({ ok: false, error: 'already_answered' });
  });

  it('melody events are player-only and the host replay needs reveal', async () => {
    const { host, stage } = await toMelody();
    for (const who of [host, stage]) expect(await send(who, 'player:melody', { questionIndex: 0, step: 1 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:audio', { action: 'replay' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    expect(await send(host, 'host:audio', { action: 'replay' })).toEqual({ ok: true });
  });

  it('memory events are player-only', async () => {
    const { host, stage } = await toMemory();
    for (const who of [host, stage]) expect(await send(who, 'player:memory', { questionIndex: 0, cell: 0 })).toEqual({ ok: false, error: 'forbidden' });
  });

  it('player:draw and player:draw-guess are player-only and validated', async () => {
    const created = (await startGame(ctx.app, makeQuiz([drawing]))).game;
    const { host, stage, olena, taras } = await lobby(created);
    for (const who of [host, stage]) {
      expect(await send(who, 'player:draw', { op: 'begin', c: 0, w: 0, p: [1, 1] })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:draw-guess', { text: 'маяк' })).toEqual({ ok: false, error: 'forbidden' });
    }
    const bad = [
      { op: 'begin', c: 9, w: 0, p: [1, 1] },
      { op: 'begin', c: 0, w: 3, p: [1, 1] },
      { op: 'begin', c: 0, w: 0, p: [1, 1001] },
      { op: 'begin', c: 0, w: 0, p: [1, 1, 2] },
      { op: 'begin', c: 0, w: 0, p: [1.5, 1] },
      { op: 'more', index: 0, p: Array.from({ length: 129 * 2 }, () => 1) },
      { op: 'undo', extra: 1 },
      { op: 'paint' },
      undefined,
    ];
    for (const payload of bad) expect(await send(olena, 'player:draw', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    for (const payload of [{ text: 5 }, { text: 'а'.repeat(61) }, {}, undefined]) expect(await send(taras, 'player:draw-guess', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:draw', { op: 'begin', c: 0, w: 0, p: [1, 1] })).toEqual({ ok: true });
    expect(await send(taras, 'player:draw', { op: 'begin', c: 0, w: 0, p: [1, 1] })).toEqual({ ok: false, error: 'drawing_not_drawer' });
    expect(await send(taras, 'player:draw-guess', { text: 'ромашка' })).toEqual({ ok: false, error: 'drawing_miss' });
    expect(await send(taras, 'player:draw-guess', { text: 'Соняшник' })).toEqual({ ok: true });
  });

  it('every socket of the room gets the drawing event, the word never', async () => {
    const created = (await startGame(ctx.app, makeQuiz([drawing]))).game;
    const { host, stage, olena, taras } = await lobby(created);
    const frames = { stage: [] as unknown[], taras: [] as unknown[] };
    stage.socket.onAny((...args) => frames.stage.push(args));
    taras.socket.onAny((...args) => frames.taras.push(args));
    const got = { host: listenDrawing(host), stage: listenDrawing(stage), olena: listenDrawing(olena), taras: listenDrawing(taras) };
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:draw', { op: 'begin', c: 4, w: 1, p: [100, 200] })).toEqual({ ok: true });
    const event: DrawingEvent = { kind: 'ops', questionIndex: 0, rev: 1, op: { op: 'begin', c: 4, w: 1, p: [100, 200] } };
    await vi.waitFor(() => {
      for (const list of Object.values(got)) expect(list).toEqual([event]);
    });
    expect(await send(taras, 'player:draw-guess', { text: 'ромашка' })).toEqual({ ok: false, error: 'drawing_miss' });
    await pause(50);
    for (const list of Object.values(frames)) expect(JSON.stringify(list)).not.toContain('соняшник');
  });

  it('a new socket gets the drawing on connect', async () => {
    const created = (await startGame(ctx.app, makeQuiz([drawing]))).game;
    const { game, host, olena } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    for (let i = 0; i < 3; i++) expect(await send(olena, 'player:draw', { op: 'begin', c: i, w: 0, p: [i, i] })).toEqual({ ok: true });
    const strokes = [0, 1, 2].map((i) => ({ c: i, w: 0, p: [i, i] }));
    const sync: DrawingEvent = { kind: 'sync', questionIndex: 0, rev: 3, strokes };
    const late = open({ code: game.code, role: 'stage', token: game.stageToken });
    const got = listenDrawing(late);
    const order: string[] = [];
    late.socket.onAny((event: string) => order.push(event));
    await vi.waitFor(() => expect(got).toEqual([sync]));
    // штрихи приходять раніше за перший зріз: клієнт зі скинутою моделлю не просить draw:sync удруге
    await vi.waitFor(() => expect(order.slice(0, 2)).toEqual(['drawing', 'state']));
    expect(await send(late, 'draw:sync')).toEqual({ ok: true });
    await vi.waitFor(() => expect(got).toEqual([sync, sync]));
    expect(await send(late, 'draw:sync')).toEqual({ ok: true });
    expect(await send(late, 'draw:sync')).toEqual({ ok: false, error: 'too_soon' });
    await pause(50);
    expect(got).toHaveLength(3);
  });

  it('player:truth saves the fact and answers ok only', async () => {
    const created = (await startGame(ctx.app, makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2')]))).game;
    const { host, stage, olena, taras, olenaJoin } = await lobby(created);
    for (const who of [host, stage]) expect(await send(who, 'player:truth', { text: 'Я стрибала з парашутом' })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [{ text: 5 }, {}, undefined]) expect(await send(olena, 'player:truth', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:truth', { text: 'я'.repeat(201) })).toEqual({ ok: false, error: 'truth_text' });
    // ack — лише ok: ні тексту, ні id
    expect(await send(olena, 'player:truth', { text: 'Я стрибала з парашутом' })).toEqual({ ok: true });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.truth?.fact === 'Я стрибала з парашутом');
    if (mine.role !== 'player') throw new Error('not a player');
    const panel = await until(host, (view) => view.role === 'host' && (view.truth?.facts.length ?? 0) === 1);
    if (panel.role !== 'host') throw new Error('not a host');
    expect(panel.truth?.facts).toMatchObject([{ id: olenaJoin.playerId, text: 'Я стрибала з парашутом', hidden: false }]);
    // сусід і сцена бачать лише число
    const other = await until(taras, (view) => view.truth?.count === 1);
    const scene = await until(stage, (view) => view.truth?.count === 1);
    for (const view of [other, scene]) expect(JSON.stringify(view)).not.toContain('парашутом');
  });

  it('host:truth-hide hides a fact', async () => {
    const created = (await startGame(ctx.app, makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2')]))).game;
    const { host, olena, olenaJoin } = await lobby(created);
    expect(await send(olena, 'player:truth', { text: 'Я знаю шість мов' })).toEqual({ ok: true });
    for (const payload of [{ playerId: olenaJoin.playerId }, { hidden: true }, undefined]) expect(await send(host, 'host:truth-hide', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'host:truth-hide', { playerId: olenaJoin.playerId, hidden: true })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:truth-hide', { playerId: 'nobody', hidden: true })).toEqual({ ok: false, error: 'not_found' });
    expect(await send(host, 'host:truth-hide', { playerId: olenaJoin.playerId, hidden: true })).toEqual({ ok: true });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.truth?.hidden === true);
    expect(mine.truth?.count).toBe(0);
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

  it('player:buff carries the peek target to the manager; a non-string target is invalid (12h)', async () => {
    const quiz = makeQuiz([single, text], { buffs: ['peek'] });
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, olena, taras, tarasJoin } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(taras, 'player:answer', wrong)).toEqual({ ok: true });
    expect(await send(olena, 'player:buff', { kind: 'peek', targetId: 5 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:buff', { kind: 'peek' })).toEqual({ ok: false, error: 'peek_target' });
    expect(await send(olena, 'player:buff', { kind: 'peek', targetId: tarasJoin.playerId })).toEqual({ ok: true });
    const mine = await until(olena, (v) => v.role === 'player' && v.me.buffs?.active?.peek != null);
    expect(mine.role === 'player' && mine.me.buffs?.active?.peek).toEqual({ target: { playerId: tarasJoin.playerId, nickname: 'Тарас' }, answer: wrong });
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

  it("stealth reaches only the owner's sockets (29h)", async () => {
    const quiz = makeQuiz([single, text], { buffs: ['stealth'], debuffs: ['fog'], debuffPrices: { fog: 100 } });
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena, taras } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    await until(olena, (v) => v.phase !== 'lobby' && v.phase !== 'guide');
    await pause(100);
    const others = () => [stage, host, taras].map((who) => who.states);
    const before = others();
    const own = olena.states;
    expect(await send(olena, 'player:buff', { kind: 'stealth' })).toEqual({ ok: true });
    const mine = await until(olena, (v) => v.role === 'player' && v.me.stealth === 'armed');
    expect(mine.role === 'player' && mine.me.stealth).toBe('armed');
    await pause(200);
    expect(olena.states).toBeGreaterThan(own);
    expect(others()).toEqual(before);
    expect(taras.last?.role === 'player' && taras.last.me.stealth).toBe('ready');
  });

  it('an anonymous purchase over the socket (29h)', async () => {
    const quiz = makeQuiz([single, text], { buffs: ['stealth'], debuffs: ['fog'], debuffPrices: { fog: 100 } });
    const created = (await startGame(ctx.app, quiz)).game;
    const { host, stage, olena, taras, olenaJoin, tarasJoin } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 150 })).toEqual({ ok: true });
    expect(await send(olena, 'player:buff', { kind: 'stealth' })).toEqual({ ok: true });
    expect(await send(olena, 'player:debuff', { targetId: tarasJoin.playerId, kind: 'fog' })).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(taras, (v) => v.role === 'player' && v.me.debuff !== null);
    await until(host, (v) => v.role === 'host' && v.players.some((p) => p.debuff !== null && p.debuff !== undefined));
    await pause(100);
    const hit = taras.last;
    expect(hit?.role === 'player' && hit.me.debuff).toMatchObject({ kind: 'fog', by: null });
    const watch = host.last;
    const hurt = watch?.role === 'host' ? watch.players.find((p) => p.id === tarasJoin.playerId) : undefined;
    expect(hurt?.debuff).toMatchObject({ kind: 'fog', by: null, anon: true });
    for (const who of [stage, host, taras]) {
      const frame = JSON.stringify(who.last);
      expect(frame).not.toContain('"buyer":{');
      expect(frame).not.toContain(`"by":"${olenaJoin.playerId}"`);
      expect(frame).not.toContain('"by":"Олена"');
    }
  });

  it('stealth in teams — the captain only, the whole team hears it (29h)', async () => {
    const game = (await startGame(ctx.app, makeRoundsQuiz([classicRound('r1', [text, single])], { teams: defaultTeams(2), buffs: ['stealth'], debuffs: ['fog'], debuffPrices: { fog: 100 } }))).game;
    const joins = [];
    for (const name of ['Олена', 'Тарас', 'Іра', 'Марко']) joins.push(await join(game.code, name));
    const host = open({ code: game.code, role: 'host', token: game.hostToken });
    const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
    const [olena, taras, ira, marko] = joins.map((j) => open({ code: game.code, role: 'player', token: j.token }));
    const view = await until(host, (v) => v.role === 'host' && (v.teams?.unassigned.filter((m) => m.connected).length ?? 0) === 4);
    const [red, blue] = (view.teams?.teams ?? []).map((t) => t.id);
    for (const [i, team] of [red, red, blue, blue].entries()) {
      expect(await send(host, 'host:team-assign', { memberId: joins[i].playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    for (const who of [olena, taras, ira, marko, stage, host]) await until(who, inPhase('question'));
    await pause(100);
    const outsiders = () => [ira, marko, stage, host].map((who) => who.states);
    const before = outsiders();
    expect(await send(taras, 'player:buff', { kind: 'stealth' })).toEqual({ ok: false, error: 'not_captain' });
    expect(await send(olena, 'player:buff', { kind: 'stealth' })).toEqual({ ok: true });
    for (const who of [olena, taras]) await until(who, (v) => v.role === 'player' && v.me.stealth === 'armed');
    await pause(200);
    expect(outsiders()).toEqual(before);
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
  it('player:wager in a bets round answers with the bet errors', async () => {
    const game = (await startGame(ctx.app, makeRoundsQuiz([betsRound('b', [withId(single, 'b1')])]))).game;
    const { host, olena, taras, olenaJoin } = await lobby(game);
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('wager'));
    // Бали від ведучого на етапі ставок піднімають межу Олени; Тарас лишається з нулем.
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 800 })).toEqual({ ok: true });
    expect(await send(olena, 'player:wager', { amount: 100 })).toEqual({ ok: false, error: 'bet_range' });
    expect(await send(olena, 'player:wager', { amount: 900 })).toEqual({ ok: false, error: 'bet_range' });
    expect(await send(taras, 'player:wager', { amount: 200 })).toEqual({ ok: false, error: 'bet_skipped' });
    expect(await send(olena, 'player:wager', { amount: 300 })).toEqual({ ok: true });
  });
  it('player:wager in an auction answers with the bid errors', async () => {
    const game = (await startGame(ctx.app, makeRoundsQuiz([auctionRound('a', [withId(single, 'a1')], { bidMode: 'free' })]))).game;
    const { host, olena, taras, olenaJoin } = await lobby(game);
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(olena, inPhase('wager'));
    // Бали від ведучого на торгу піднімають межу Олени до 300; Тарас лишається з нулем.
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 300 })).toEqual({ ok: true });
    expect(await send(olena, 'player:wager', { amount: 0 })).toEqual({ ok: false, error: 'bid_low' });
    expect(await send(olena, 'player:wager', { amount: 301 })).toEqual({ ok: false, error: 'bid_over' });
    expect(await send(taras, 'player:wager', { amount: 100 })).toEqual({ ok: false, error: 'bid_none' });
    expect(await send(olena, 'player:wager', { amount: 120 })).toEqual({ ok: true });
    expect(await send(olena, 'player:wager', { amount: 200 })).toEqual({ ok: false, error: 'bid_leader' });
    expect(await send(olena, 'player:wager', { amount: 120, allIn: true })).toEqual({ ok: false, error: 'bid_leader' });
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

describe('award carousel over sockets (12d)', () => {
  type Step = { seq: number };
  const listen = (tracked: Tracked) => {
    const received: Step[] = [];
    (tracked.socket as unknown as { on(event: string, listener: (step: Step) => void): void }).on('awards', (step) => received.push(step));
    return received;
  };
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /** Гра до кінця: Олена відповідає правильно й першою, Тарас — хибно; нагороди є. */
  const finished = async () => {
    const setup = await lobby((await startGame(ctx.app, makeQuiz([single, withId(single, 'second')]))).game);
    const room = ctx.manager.get(setup.game.code)!;
    await send(setup.host, 'host:start');
    for (let guard = 0; guard < 40 && room.state.phase !== 'finished'; guard++) {
      if (room.state.phase === 'question') {
        ctx.manager.answer(room, setup.olenaJoin.playerId, correct as never);
        ctx.manager.answer(room, setup.tarasJoin.playerId, wrong as never);
        await send(setup.host, 'host:lock');
      } else await send(setup.host, 'host:next');
    }
    await until(setup.stage, inPhase('finished'));
    return setup;
  };

  it('host:awards reaches the stage alone: not the phones, not the host', async () => {
    const { host, stage, olena, taras } = await finished();
    const heard = { host: listen(host), stage: listen(stage), olena: listen(olena), taras: listen(taras) };
    expect(await send(host, 'host:awards')).toEqual({ ok: true });
    expect(await send(host, 'host:awards')).toEqual({ ok: true });
    await pause(200);
    expect(heard.stage).toHaveLength(2);
    expect(heard.stage[1]!.seq).toBeGreaterThan(heard.stage[0]!.seq);
    expect(heard.host).toEqual([]);
    expect(heard.olena).toEqual([]);
    expect(heard.taras).toEqual([]);
  });

  it('a player or the stage cannot send it; outside the finish it is wrong_phase', async () => {
    const { host, stage, olena } = await finished();
    expect(await send(olena, 'host:awards')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:awards')).toEqual({ ok: false, error: 'forbidden' });
    const early = await lobby();
    expect(await send(early.host, 'host:awards')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:awards')).toEqual({ ok: true });
  });
});

describe('likes over sockets (17a)', () => {
  it('player:like hearts the revealed question; the like event disconnects nobody', async () => {
    const created = await createGame();
    const account = await signUp(ctx.app, 'Олена');
    const joined = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/by-code/${created.code}/join`,
      payload: { nickname: 'Олена' },
      headers: { cookie: account.cookie },
    });
    const olenaJoin = joined.json() as { token: string; playerId: string };
    const tarasJoin = await join(created.code, 'Тарас');
    const host = open({ code: created.code, role: 'host', token: created.hostToken });
    const stage = open({ code: created.code, role: 'stage', token: created.stageToken });
    const olena = open({ code: created.code, role: 'player', token: olenaJoin.token });
    const taras = open({ code: created.code, role: 'player', token: tarasJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);
    const room = ctx.manager.get(created.code)!;
    await send(host, 'host:start');
    for (let guard = 0; guard < 20 && room.state.phase !== 'reveal'; guard++) await send(host, room.state.phase === 'question' ? 'host:lock' : 'host:next');
    await until(olena, (view) => view.role === 'player' && view.likes?.question === false);
    expect(await send(taras, 'player:like', { target: 'question', liked: true })).toEqual({ ok: false, error: 'like_guest' });
    expect(await send(olena, 'player:like', { target: 'question', liked: 'yes' })).toMatchObject({ ok: false });
    expect(await send(olena, 'player:like', { target: 'question', liked: true })).toEqual({ ok: true });
    await until(olena, (view) => view.role === 'player' && view.likes?.question === true);
    await pause(200);
    for (const tracked of [host, stage, olena, taras]) expect(tracked.socket.connected).toBe(true);
    expect(room.likes.mine.get(room.playerUsers.get(olenaJoin.playerId)!)).toEqual(new Set(['q:q1']));
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

  it('after the game is over the flag still follows the stage: a second tab, a closed one and a reopened one', async () => {
    const { game, host, stage, olena } = await lobby(await createGame());
    const meta: boolean[] = [];
    host.socket.on('state', (_view, m) => meta.push(m.stageOnline));
    const stageIs = async (online: boolean) => {
      for (let i = 0; i < 100 && meta.at(-1) !== online; i += 1) await pause(20);
      expect(meta.at(-1)).toBe(online);
    };
    await send(host, 'host:start');
    await send(host, 'host:end');
    await until(olena, inPhase('finished'));
    await until(stage, inPhase('finished'));
    const second = open({ code: game.code, role: 'stage', token: game.stageToken });
    await until(second, inPhase('finished'));
    stage.socket.close();
    await pause(100);
    // Друга вкладка сцени ще відкрита.
    expect(meta.at(-1) ?? true).toBe(true);
    second.socket.close();
    await stageIs(false);
    const again = open({ code: game.code, role: 'stage', token: game.stageToken });
    await stageIs(true);
    await until(again, inPhase('finished'));
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
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });

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

  it('the host gets tilts only while it watches (12b): none without «наживо», the current one right when it turns on', async () => {
    const filler = (prefix: string) => [1, 2, 3].map((n) => ({ ...withId(single, `${prefix}${n}`), points: 100 * n }));
    const board = makeRoundsQuiz([
      boardRound('g1', [
        { title: 'Сортування', cells: [{ answerMode: 'phone', question: sortQ }, ...filler('a').slice(0, 2)] },
        { title: 'Міста', cells: filler('b') },
        { title: 'Річки', cells: filler('c') },
      ]),
    ]);
    const { host, stage, olena, taras, olenaJoin, tarasJoin } = await lobby((await startGame(ctx.app, board)).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    expect(await send(host, 'host:pick', { cellId: sortQ.id })).toEqual({ ok: true });
    for (const who of [olena, taras, stage, host]) await until(who, inPhase('question'));
    const [chooser, chooserJoin] = cardOf(olena.last) !== null ? [olena, olenaJoin] : [taras, tarasJoin];
    const wordId = cardOf(chooser.last);
    const got = listenTilt(host);
    expect(await send(chooser, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: true });
    // Кругообіг підтвердження пульта: усе, що сервер надіслав йому до нього, уже прийшло.
    expect(await send(host, 'player:sort-tilt', { wordId, categoryId: 'c1', amount: 0.7 })).toEqual({ ok: false, error: 'forbidden' });
    expect(got).toEqual([]);
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    const tilt: SortTilt = { sorterId: chooserJoin.playerId, wordId: wordId!, toward: 'c1', amount: 0.7, seq: 0 };
    expect(got).toEqual([tilt]);
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

describe('live drafts (12b)', () => {
  /** Класика «кілька правильних, текст»; усі на першому запитанні. */
  async function opened() {
    const parts = await lobby((await startGame(ctx.app, makeQuiz([multi, text]))).game);
    expect(await send(parts.host, 'host:start')).toEqual({ ok: true });
    expect(await send(parts.host, 'host:next')).toEqual({ ok: true });
    for (const who of [parts.host, parts.stage, parts.olena, parts.taras]) await until(who, inPhase('question'));
    return parts;
  }

  it('a solo draft reaches only a watching host, in a batch; the stage and other phones get nothing', async () => {
    const { host, stage, olena, taras } = await lobby((await startGame(ctx.app, makeQuiz([multi, text]))).game);
    const hostDrafts = listenDrafts(host);
    const others = [stage, taras, olena].map(listenDrafts);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    for (const who of [host, stage, olena, taras]) await until(who, inPhase('question'));
    expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds: ['a', 'c'] } })).toEqual({ ok: true });
    await pause(400);
    expect(hostDrafts).toEqual([]); // ще не ввімкнув «наживо»
    const states = host.states;
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts.map((d) => d.draft)).toEqual([{ type: 'multi', optionIds: ['a', 'c'] }]));
    expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds: ['c'] } })).toEqual({ ok: true });
    await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts[0]).toMatchObject({ draft: { type: 'multi', optionIds: ['c'] }, changes: 1 }));
    expect(host.states).toBe(states); // на чернетку пульт не отримує зрізу
    expect(others.map((list) => list.length)).toEqual([0, 0, 0]);
    for (const who of [stage, taras]) expect(JSON.stringify(who.last)).not.toContain('"optionIds":["c"]');
  });

  it('turning «наживо» off stops the batches', async () => {
    const { host, olena } = await opened();
    const hostDrafts = listenDrafts(host);
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    expect(hostDrafts).toHaveLength(1);
    expect(await send(host, 'host:live-watch', { on: false })).toEqual({ ok: true });
    expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds: ['b'] } })).toEqual({ ok: true });
    await pause(500);
    expect(hostDrafts).toHaveLength(1);
  });

  it('batches come at most every 300 ms, and the last one carries the last value', async () => {
    const { host, olena } = await opened();
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    // Пакет на ввімкнення вже прийшов (кругообіг підтвердження); далі рахуємо лише пакети чернеток.
    const hostDrafts = listenDrafts(host);
    for (const optionIds of [['a'], ['a', 'b'], ['b'], ['b', 'c'], ['d']]) {
      expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds } })).toEqual({ ok: true });
      await pause(50);
    }
    await pause(400);
    expect(hostDrafts.length).toBeGreaterThan(0);
    expect(hostDrafts.length).toBeLessThanOrEqual(2);
    expect(hostDrafts.at(-1)?.drafts.map((d) => d.draft)).toEqual([{ type: 'multi', optionIds: ['d'] }]);
  });

  it('the batch sent on «наживо» counts: the next one waits out the 300 ms window', async () => {
    const { host, olena } = await opened();
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    const hostDrafts = listenDrafts(host);
    expect(await send(olena, 'player:draft', { draft: { type: 'multi', optionIds: ['b'] } })).toEqual({ ok: true });
    await pause(100);
    expect(hostDrafts).toEqual([]);
    await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts.map((d) => d.draft)).toEqual([{ type: 'multi', optionIds: ['b'] }]));
  });

  it('host:live-watch is host-only and validated; a draft text over 100 characters is invalid', async () => {
    const { host, stage, olena } = await lobby((await startGame(ctx.app, makeQuiz([text, multi]))).game);
    for (const who of [olena, stage]) expect(await send(who, 'host:live-watch', { on: true })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [{ on: 'yes' }, undefined]) expect(await send(host, 'host:live-watch', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:draft', { draft: { type: 'text', value: 'я'.repeat(101) } })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:draft', { draft: { type: 'text', value: 'я'.repeat(100) } })).toEqual({ ok: true });
  });

  it('an answer takes the draft out of the next batch', async () => {
    const { host, olena, olenaJoin } = await lobby((await startGame(ctx.app, makeQuiz([text, multi]))).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    const hostDrafts = listenDrafts(host);
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    expect(await send(olena, 'player:draft', { draft: { type: 'text', value: 'Чернет' } })).toEqual({ ok: true });
    await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts.map((d) => d.id)).toEqual([olenaJoin.playerId]));
    expect(await send(olena, 'player:answer', { type: 'text', value: 'Київ' })).toEqual({ ok: true });
    await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts).toEqual([]));
  });
});

describe('player:away over sockets (12e)', () => {
  it('a player reports a leave; the host and the stage are forbidden; a bad payload is invalid', async () => {
    const { host, stage, olena } = await lobby();
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:away', { away: true })).toEqual({ ok: true });
    expect(await send(olena, 'player:away', { away: false, ms: 1200, sinceReturnMs: 0 })).toEqual({ ok: true });
    for (const who of [host, stage]) expect(await send(who, 'player:away', { away: true })).toEqual({ ok: false, error: 'forbidden' });
    for (const payload of [{ away: 'x' }, { away: false, ms: -1 }, { away: false, sinceReturnMs: 0.5 }, undefined]) {
      expect(await send(olena, 'player:away', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
  });

  it('end to end: a leave over the socket lands in the database as answer.away_ms and an away adjustment', async () => {
    await ctx.app.close();
    const scheduler = new FakeScheduler();
    ctx = await buildApp({ db, auth: TEST_AUTH, scheduler });
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })], { awayPenalty: true });
    const { host, olena, taras, olenaJoin, tarasJoin } = await lobby((await startGame(ctx.app, quiz)).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:away', { away: true })).toEqual({ ok: true });
    scheduler.advance(3500);
    expect(await send(olena, 'player:away', { away: false, ms: 3500 })).toEqual({ ok: true });
    const own = await until(olena, (view) => view.role === 'player' && (view.away?.ms ?? 0) === 3500);
    expect(own.role === 'player' && own.away).toMatchObject({ ms: 3500, count: 1, out: false, penalty: true });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', correct)).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    expect(await send(host, 'host:next')).toEqual({ ok: true }); // розкриття
    expect(await send(host, 'host:next')).toEqual({ ok: true }); // далі: бали остаточні — штраф
    await until(host, (view) => view.phase !== 'locked' && view.phase !== 'reveal');
    await ctx.recorder.idle();
    await vi.waitFor(async () => {
      const rows = await db.select().from(answer).where(inArray(answer.participantId, [olenaJoin.playerId, tarasJoin.playerId]));
      expect(rows.map((r) => [r.participantId, r.awayMs]).sort()).toEqual([[olenaJoin.playerId, 3500], [tarasJoin.playerId, null]].sort());
      const adjustments = await db.select().from(scoreAdjustment).where(eq(scoreAdjustment.participantId, olenaJoin.playerId));
      expect(adjustments).toEqual([expect.objectContaining({ source: 'away', points: -1000 })]);
    });
  });
});

describe('appeals over real sockets (12f)', () => {
  /** Олена відповіла правильно, Тарас — неправильно; ведучий відкрив розкриття. */
  async function atReveal(quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')], { speedBonus: false })])) {
    const started = await lobby((await startGame(ctx.app, quiz)).game);
    const { host, olena, taras } = started;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
    expect(await send(taras, 'player:answer', wrong)).toEqual({ ok: true });
    await until(host, inPhase('locked'));
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(taras, inPhase('reveal'));
    return started;
  }

  it('a player appeals on the reveal; the host and the stage cannot; a bad reason or appeal id is invalid; engine errors come through the ack', async () => {
    const { host, stage, olena, taras } = await atReveal();
    const own = await until(taras, (view) => view.role === 'player' && view.me.appeal !== null);
    expect(own.role === 'player' && own.me.appeal).toMatchObject({ reasons: ['grade'], left: 2 });
    for (const who of [host, stage]) {
      expect(await send(who, 'player:appeal', { reason: 'grade' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await send(who, 'player:appeal-vote', { appealId: 1, yes: true })).toEqual({ ok: false, error: 'forbidden' });
    }
    expect(await send(taras, 'player:appeal', { reason: 'x' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(taras, 'player:appeal')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:appeal-vote', { appealId: 0, yes: true })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:appeal-vote', { appealId: 1, yes: 'так' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:appeal-vote', { appealId: 1, yes: true })).toEqual({ ok: false, error: 'vote_closed' });
    expect(await send(olena, 'player:appeal', { reason: 'grade' })).toEqual({ ok: false, error: 'appeal_unfit' });
    expect(await send(taras, 'player:appeal', { reason: 'grade' })).toEqual({ ok: true });
    expect(await send(taras, 'player:appeal', { reason: 'grade' })).toEqual({ ok: false, error: 'appeal_unfit' });
    expect(await send(host, 'host:next')).toEqual({ ok: false, error: 'appeal_open' });
    const voter = await until(olena, (view) => view.role === 'player' && view.me.appeal?.voter === true);
    expect(voter.appeal).toMatchObject({ outcome: null, yes: 0, no: 0, waiting: 1 });
    expect(await send(taras, 'player:appeal-vote', { appealId: 1, yes: true })).toEqual({ ok: false, error: 'vote_denied' });
  });

  it('end to end: the appeal and the vote over the socket land in the database as an appeal row and an appeal adjustment', async () => {
    const { host, stage, olena, taras, olenaJoin, tarasJoin } = await atReveal();
    expect(await send(taras, 'player:appeal', { reason: 'grade' })).toEqual({ ok: true });
    expect(await send(olena, 'player:appeal-vote', { appealId: 1, yes: true })).toEqual({ ok: true });
    const decided = await until(stage, (view) => view.appeal?.outcome === 'yes');
    expect(decided.appeal).toMatchObject({ yes: 1, no: 0, waiting: 0 });
    expect(JSON.stringify(decided.appeal)).not.toContain(olenaJoin.playerId);
    const mine = await until(olena, (view) => view.appeal?.outcome === 'yes');
    expect(mine.role === 'player' && mine.me.appeal).toMatchObject({ voter: false, vote: null });
    expect(await send(host, 'host:end-round')).toEqual({ ok: true });
    await until(taras, inPhase('finished'));
    await ctx.recorder.idle();
    await vi.waitFor(async () => {
      const rows = await db.select().from(appeal).where(eq(appeal.participantId, tarasJoin.playerId));
      expect(rows).toEqual([expect.objectContaining({ seq: 1, questionIndex: 0, reason: 'grade', yes: 1, no: 0, outcome: 'yes', adjustmentSeq: expect.any(Number) })]);
      const adjustments = await db.select().from(scoreAdjustment).where(eq(scoreAdjustment.participantId, tarasJoin.playerId));
      expect(adjustments).toEqual([expect.objectContaining({ source: 'appeal', points: 1000, seq: rows[0].adjustmentSeq })]);
    });
  });
});

describe('own-pace clues (12c)', () => {
  const selfQuiz = () => makeRoundsQuiz([classicRound('r1', [{ ...clues, cluePace: 'self' }])]);
  const shownOf = (view: GameView) => (view.role === 'player' || view.role === 'stage' ? view.question?.clues?.shown.length : undefined) ?? 0;

  async function started() {
    const parts = await lobby((await startGame(ctx.app, selfQuiz())).game);
    expect(await send(parts.host, 'host:start')).toEqual({ ok: true });
    expect(await send(parts.host, 'host:next')).toEqual({ ok: true });
    for (const who of [parts.host, parts.stage, parts.olena, parts.taras]) await until(who, inPhase('question'));
    await pause(SPLASH_MS.question + 100);
    return parts;
  }

  it('a player opens a clue for themselves; the stage and the other phone keep the first', async () => {
    const { game, stage, olena, taras, olenaJoin } = await started();
    expect(await send(olena, 'player:clue')).toEqual({ ok: true });
    const mine = await until(olena, (view) => shownOf(view) === 2);
    expect(mine.role).toBe('player');
    await pause(200);
    for (const who of [stage, taras]) {
      expect(shownOf(who.last!)).toBe(1);
      expect(JSON.stringify(who.last)).not.toContain(clues.clues[1]);
    }
    const opens = (view: GameView) => (view.role === 'stage' ? view.question?.clues?.opens : undefined);
    await vi.waitFor(() => expect(opens(stage.last!)?.map((o) => [o.nickname, o.opened])).toEqual([['Олена', 2], ['Тарас', 1]]));
    // Перепідключення: новий сокет з тим самим токеном бачить свої підказки.
    olena.socket.close();
    const back = open({ code: game.code, role: 'player', token: olenaJoin.token });
    expect(shownOf(await until(back, (view) => shownOf(view) > 0))).toBe(2);
  });

  it('after the answer player:clue acks already_answered', async () => {
    const { olena } = await started();
    expect(await send(olena, 'player:answer', { type: 'clues', value: 'Шевченко' })).toEqual({ ok: true });
    expect(await send(olena, 'player:clue')).toEqual({ ok: false, error: 'already_answered' });
  });

  it('only a player may send player:clue', async () => {
    const { host, stage } = await started();
    expect(await send(host, 'player:clue')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'player:clue')).toEqual({ ok: false, error: 'forbidden' });
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
    const hostDrafts = listenDrafts(host);
    const others = [stage, olena, taras, ira, marko].map(listenDrafts);
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    const counts = () => [olena, ira, marko, stage, host].map((who) => who.states);
    const before = counts();

    expect(await send(olena, 'player:draft', { draft: { type: 'text', value: 'Чернетка-Львів' } })).toEqual({ ok: true });
    const seen = await until(taras, (v) => v.role === 'player' && v.team?.draft !== null && v.team?.draft !== undefined);
    expect(seen.role === 'player' && seen.team?.draft).toEqual({ type: 'text', value: 'Чернетка-Львів' });
    // Пульт отримує пакет host:drafts, а не зріз (12b).
    await vi.waitFor(() => expect(hostDrafts.at(-1)?.drafts).toEqual([expect.objectContaining({ id: red, draft: { type: 'text', value: 'Чернетка-Львів' } })]));
    // Кругообіг підтвердження: усе, що сервер надіслав цим сокетам до нього, уже прийшло.
    expect(await send(marko, 'player:draft', { draft: null })).toEqual({ ok: false, error: 'not_captain' });
    expect(await send(ira, 'player:team', { teamId: red })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(stage, 'host:team-deal')).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:team-deal')).toEqual({ ok: false, error: 'wrong_phase' });
    expect(counts()).toEqual(before);
    for (const who of [olena, ira, marko, stage, host]) expect(JSON.stringify(who.last)).not.toContain('Чернетка-Львів');
    expect(others.map((list) => list.length)).toEqual([0, 0, 0, 0, 0]);
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
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
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

describe('player:pick-answerer over sockets (12g)', () => {
  /** «Вибирає капітан»: Олена (капітан) і Тарас — червоні, Іра (капітан) і Марко — сині; гра на заставці раунду. */
  async function chosenGame() {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')])], { teams: { ...defaultTeams(2), answerer: 'chosen' } });
    const game = (await startGame(ctx.app, quiz)).game;
    const joins = [];
    for (const name of ['Олена', 'Тарас', 'Іра', 'Марко']) joins.push(await join(game.code, name));
    const host = open({ code: game.code, role: 'host', token: game.hostToken });
    const stage = open({ code: game.code, role: 'stage', token: game.stageToken });
    const [olena, taras, ira, marko] = joins.map((j) => open({ code: game.code, role: 'player', token: j.token }));
    const view = await until(host, (v) => v.role === 'host' && (v.teams?.unassigned.filter((m) => m.connected).length ?? 0) === 4);
    const [red, blue] = (view.teams?.teams ?? []).map((t) => t.id);
    for (const [i, team] of [red, red, blue, blue].entries()) {
      expect(await send(host, 'host:team-assign', { memberId: joins[i].playerId, teamId: team })).toEqual({ ok: true });
    }
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    const [olenaId, tarasId] = joins.map((j) => j.playerId);
    return { game, host, stage, olena, taras, ira, marko, olenaId, tarasId };
  }

  it('the captain picks between questions; host and stage are forbidden, a teammate not_captain, a bad scope invalid, a question wrong_phase', async () => {
    const { host, stage, olena, taras, tarasId } = await chosenGame();
    for (const who of [host, stage]) {
      expect(await send(who, 'player:pick-answerer', { memberId: tarasId, scope: 'question' })).toEqual({ ok: false, error: 'forbidden' });
    }
    for (const payload of [undefined, { memberId: tarasId }, { memberId: tarasId, scope: 'game' }, { memberId: 5, scope: 'round' }]) {
      expect(await send(olena, 'player:pick-answerer', payload)).toEqual({ ok: false, error: 'invalid_payload' });
    }
    expect(await send(taras, 'player:pick-answerer', { memberId: tarasId, scope: 'question' })).toEqual({ ok: false, error: 'not_captain' });
    expect(await send(olena, 'player:pick-answerer', { memberId: tarasId, scope: 'question' })).toEqual({ ok: true });
    const mine = await until(olena, (v) => v.role === 'player' && v.team?.answererPick !== null && v.team?.answererPick !== undefined);
    expect(mine.role === 'player' && mine.team?.answererPick).toEqual({ memberId: tarasId, scope: 'question' });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:pick-answerer', { memberId: null, scope: 'question' })).toEqual({ ok: false, error: 'wrong_phase' });
    // Капітан не відповідає за команду, вибраний товариш — так.
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'not_answerer' });
    expect(await send(taras, 'player:answer', correct)).toEqual({ ok: true });
  });

  it('more than four picks a second are too_soon; a kick clears the window of the person', async () => {
    const { game, host, olena, olenaId, tarasId } = await chosenGame();
    for (let i = 0; i < 4; i++) {
      expect(await send(olena, 'player:pick-answerer', { memberId: i % 2 === 0 ? tarasId : null, scope: 'round' })).toEqual({ ok: true });
    }
    expect(await send(olena, 'player:pick-answerer', { memberId: tarasId, scope: 'round' })).toEqual({ ok: false, error: 'too_soon' });
    const room = ctx.manager.get(game.code)!;
    expect(rateOf(room, 'pick').has(olenaId)).toBe(true);
    expect(await send(host, 'host:kick', { playerId: olenaId })).toEqual({ ok: true });
    expect(rateOf(room, 'pick').has(olenaId)).toBe(false);
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
    expect(await send(author, 'host:awards')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:time', { seconds: 15 })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:kick', { player: 1 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(taras, 'host:kick', { playerId: other.playerId })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:start')).toEqual({ ok: true });
    await until(taras, (view) => view.phase !== 'lobby');
  });

  it('host:truth-hide: the autopilot author cannot hide a fact, and writes one like anybody', async () => {
    const { author, taras, other } = await autopilotRoom(makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2')]));
    expect(await send(taras, 'player:truth', { text: 'Я бачив північне сяйво' })).toEqual({ ok: true });
    expect(await send(author, 'host:truth-hide', { playerId: other.playerId, hidden: true })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(taras, 'host:truth-hide', { playerId: other.playerId, hidden: true })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'player:truth', { text: 'Я пекла хліб у печі' })).toEqual({ ok: true });
    const view = await until(author, (v) => v.truth?.count === 2);
    // автор кімнати теж вгадує: чужого факту не бачить
    expect(JSON.stringify(view)).not.toContain('сяйво');
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

  it('the author starts with resume (12r); another player may not', async () => {
    const { game, author, taras, other } = await autopilotRoom(makeRoundsQuiz([classicRound('r0', [single]), classicRound('r1', [withId(single, 'q2')])]));
    const resume = { roundIndex: 1, points: { [game.playerId]: 42434, [other.playerId]: -50 } };
    expect(await send(taras, 'host:start', { resume })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(author, 'host:start', { resume: { roundIndex: 1, points: { [game.playerId]: 1.5 } } })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(author, 'host:start', { resume: { roundIndex: 7, points: {} } })).toEqual({ ok: false, error: 'resume_invalid' });
    expect(await send(author, 'host:start', { resume })).toEqual({ ok: true });
    const view = await until(taras, (v) => v.phase !== 'lobby');
    expect(view.round?.index).toBe(1);
    expect(view.role === 'player' && view.me.score).toBe(-50);
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

describe('reactions over sockets (13a)', () => {
  const listen = (tracked: Tracked) => {
    const received: Reaction[] = [];
    tracked.socket.on('reaction', (reaction) => received.push(reaction));
    return received;
  };
  const sticker = { kind: 'sticker', value: STICKERS[0]!.id };
  /** Гра до reveal першого запитання. */
  const atReveal = async () => {
    const setup = await lobby();
    await send(setup.host, 'host:start');
    await send(setup.host, 'host:next');
    await until(setup.stage, inPhase('question'));
    await send(setup.host, 'host:lock');
    await until(setup.stage, inPhase('locked'));
    await send(setup.host, 'host:next');
    await until(setup.stage, inPhase('reveal'));
    return setup;
  };

  it('a player reaction reaches the host, the stage and both phones, the author included', async () => {
    const { host, stage, olena, taras, olenaJoin } = await atReveal();
    const heard = [host, stage, olena, taras].map(listen);
    expect(await send(olena, 'player:react', sticker)).toEqual({ ok: true });
    await pause(200);
    for (const received of heard) {
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ by: olenaJoin.playerId, nickname: 'Олена', rowId: olenaJoin.playerId, item: sticker });
    }
    expect(heard[1]).toEqual(heard[0]);
    expect(heard[2]).toEqual(heard[0]);
    expect(heard[3]).toEqual(heard[0]);
  });

  it('the stage cannot react; a player cannot use host:react; the host can', async () => {
    const { host, stage, olena } = await atReveal();
    const heard = listen(stage);
    expect(await send(stage, 'player:react', sticker)).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(stage, 'host:react', sticker)).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'host:react', sticker)).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'host:react', { kind: 'emoji', value: '👏' })).toEqual({ ok: true });
    await pause(200);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ by: 'host', nickname: null, rowId: null });
  });

  it('refuses junk payloads', async () => {
    const { olena } = await atReveal();
    expect(await send(olena, 'player:react', { kind: 'sticker', value: 'nope' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:react')).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('a guest gets sticker_locked above the starter set; the host may send any sticker (15a)', async () => {
    const { host, olena } = await atReveal();
    const locked = { kind: 'sticker', value: STICKERS.find((s) => s.series === 'other')!.id };
    expect(await send(olena, 'player:react', locked)).toEqual({ ok: false, error: 'sticker_locked' });
    expect(await send(host, 'host:react', locked)).toEqual({ ok: true });
  });

  it('is wrong_phase in a question and too_soon right after a reaction', async () => {
    const early = await lobby();
    await send(early.host, 'host:start');
    await send(early.host, 'host:next');
    await until(early.stage, inPhase('question'));
    expect(await send(early.olena, 'player:react', sticker)).toEqual({ ok: false, error: 'wrong_phase' });
    const { olena } = await atReveal();
    expect(await send(olena, 'player:react', sticker)).toEqual({ ok: true });
    expect(await send(olena, 'player:react', sticker)).toEqual({ ok: false, error: 'too_soon' });
  });
});

describe('level perks over sockets (15a)', () => {
  it('player:perk: only for players, a valid kind, and a guest has none', async () => {
    const { host, stage, olena } = await lobby();
    await send(host, 'host:start');
    await send(host, 'host:next');
    await until(stage, inPhase('question'));
    expect(await send(stage, 'player:perk', { kind: 'time' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(host, 'player:perk', { kind: 'time' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await send(olena, 'player:perk', { kind: 'ward' })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:perk')).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(olena, 'player:perk', { kind: 'time' })).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('quest code over sockets (29g)', () => {
  /** Після першого (класичного) раунду — intro раунду quest. */
  async function toQuest() {
    const rig = await lobby((await startGame(ctx.app, questQuiz({ leaderboard: 'end' }))).game);
    const { host, olena } = rig;
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(host, 'host:lock')).toEqual({ ok: true });
    while (!(olena.last?.phase === 'intro')) {
      expect(await send(host, 'host:next')).toEqual({ ok: true });
      await pause(30);
    }
    return rig;
  }

  it('a code goes through the socket at any moment of the round', async () => {
    const { olena, taras, stage } = await toQuest();
    expect(await send(olena, 'player:quest', { code: 'сова' })).toEqual({ ok: true });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.quest?.solved !== null && view.me.quest?.solved !== undefined);
    expect(mine.role === 'player' ? mine.me.quest?.solved : null).toMatchObject({ points: 1200 });
    const seen = await until(stage, (view) => view.quest?.rows.some((row) => row.solved !== null) === true);
    expect(seen.quest?.rows.find((row) => row.nickname === 'Олена')?.solved).toMatchObject({ place: 1 });
    expect(JSON.stringify(seen)).not.toContain('СОВА');
    expect(await send(taras, 'player:quest', { code: 7 })).toEqual({ ok: false, error: 'invalid_payload' });
    expect(await send(taras, 'player:quest', { code: 'x'.repeat(40) })).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('a wrong code burns a try and is acked; a wrong length is refused', async () => {
    const { olena } = await toQuest();
    expect(await send(olena, 'player:quest', { code: 'СОВИ' })).toEqual({ ok: true });
    const mine = await until(olena, (view) => view.role === 'player' && view.me.quest?.left === 2);
    expect(mine.role === 'player' ? mine.me.quest?.tries : null).toEqual(['СОВИ']);
    expect(await send(olena, 'player:quest', { code: 'СОВ' })).toEqual({ ok: false, error: 'quest_length' });
  });

  it('is refused in a classic round', async () => {
    const { host, olena } = await lobby((await startGame(ctx.app, questQuiz())).game);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:quest', { code: 'сова' })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('lighter snapshots (30c)', () => {
  it('an idle timed question sends no state: the clock counts from endsAt on the client', async () => {
    const created = (await startGame(ctx.app, makeQuiz([{ ...single, timeLimit: 30 }, text]))).game;
    const { host, stage, olena, taras } = await lobby(created);
    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    for (const client of [host, stage, olena, taras]) await until(client, inPhase('question'));
    await pause(300);
    const all = [host, stage, olena, taras];
    const before = all.map((client) => client.states);
    await pause(2500);
    expect(all.map((client) => client.states)).toEqual(before);
    for (const client of all) expect(typeof client.last?.endsAt).toBe('number');
  });
});
