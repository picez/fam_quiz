import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { betsMinimumNow, betsPlaying } from '@quiz/engine';
import { auctionRound, betsRound, makeQuiz, makeRoundsQuiz, single, letterwordsRandom, moreless, text, timedlist, withId, wordladder } from '@quiz/engine/testing';
import { AUCTION_BID_MS, type AckResult, type ClientToServerEvents, type GameView, type ServerToClientEvents, type SocketAuth } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { buildApp } from './app';
import { clientAddress, LOOKUPS_PER_MINUTE } from './socket';
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

  it("a restored room keeps every player's ladder words", async () => {
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeQuiz([wordladder]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const tarasJoin = await join(first.ctx, started.code, 'Тарас');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    const taras = client(first.port, { code: started.code, role: 'player', token: tarasJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    // Слова шляху ведучого: словник не потрібен.
    for (const word of ['пола', 'пора']) expect(await send(olena, 'player:wordladder', { word })).toEqual({ ok: true });
    expect(await send(taras, 'player:wordladder', { word: 'пола' })).toEqual({ ok: true });
    const before = first.ctx.manager.get(started.code)?.state.plays[0]?.wordladder;
    expect(before).toEqual({ [olenaJoin.playerId]: { words: ['пола', 'пора'] }, [tarasJoin.playerId]: { words: ['пола'] } });

    await first.ctx.shutdown();
    olena.last = null;
    const second = await boot(db, 'b', first.port);
    const mine = await until(olena, (view) => view.role === 'player' && view.phase === 'question' && view.me.wordladder !== undefined);
    expect(mine.role === 'player' && mine.me.wordladder?.words).toEqual(['пола', 'пора']);
    expect(second.ctx.manager.get(started.code)?.state.plays[0]?.wordladder).toEqual(before);
  });

  it('a restored bets room keeps the wagers and who plays', async () => {
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeRoundsQuiz([betsRound('b', [withId(single, 'b1')])]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const tarasJoin = await join(first.ctx, started.code, 'Тарас');
    const viraJoin = await join(first.ctx, started.code, 'Віра');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    const taras = client(first.port, { code: started.code, role: 'player', token: tarasJoin.token });
    const vira = client(first.port, { code: started.code, role: 'player', token: viraJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 3);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('wager'));
    // Віра лишається без балів і не може ставити.
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 800 })).toEqual({ ok: true });
    expect(await send(host, 'host:adjust', { playerId: tarasJoin.playerId, points: 500 })).toEqual({ ok: true });
    expect(await send(olena, 'player:wager', { amount: 300 })).toEqual({ ok: true });
    // Тарас ще не поставив: ставки не закриті.
    const early = { [olenaJoin.playerId]: 300 };
    const wagers = { [olenaJoin.playerId]: 300, [tarasJoin.playerId]: 200 };
    expect(first.ctx.manager.get(started.code)?.state.final?.wagers).toEqual(early);
    const minimum = betsMinimumNow(first.ctx.manager.get(started.code)!.state);
    expect(minimum).toBe(200);

    // Збережена на етапі ставок: ставки й мінімум ті самі.
    await first.ctx.shutdown();
    host.last = null;
    const second = await boot(db, 'b', first.port);
    await until(host, (view) => view.role === 'host' && view.phase === 'wager' && view.paused);
    const restoredWager = second.ctx.manager.get(started.code)!.state;
    expect(restoredWager.final?.wagers).toEqual(early);
    expect(betsMinimumNow(restoredWager)).toBe(minimum);

    // Тарас ставить — ставили всі, хто може, і запитання відкрито; збережена на запитанні — той, хто пропускає, і далі отримує bet_skipped.
    expect(await send(host, 'host:resume')).toEqual({ ok: true });
    await until(taras, (view) => view.phase === 'wager' && !view.paused);
    expect(await send(taras, 'player:wager', { amount: 200 })).toEqual({ ok: true });
    await until(olena, (view) => view.phase === 'question' && !view.paused);
    expect(second.ctx.manager.get(started.code)?.state.plays[0].final?.wagers).toEqual(wagers);
    await second.ctx.shutdown();
    host.last = vira.last = null;
    const third = await boot(db, 'c', first.port);
    await until(host, (view) => view.role === 'host' && view.phase === 'question' && view.paused);
    const restoredQuestion = third.ctx.manager.get(started.code)!.state;
    expect(restoredQuestion.plays[0].final?.wagers).toEqual(wagers);
    expect([...(betsPlaying(restoredQuestion) ?? [])].sort()).toEqual([olenaJoin.playerId, tarasJoin.playerId].sort());
    expect(await send(host, 'host:resume')).toEqual({ ok: true });
    await until(vira, (view) => view.phase === 'question' && !view.paused);
    expect(await send(vira, 'player:answer', correct)).toEqual({ ok: false, error: 'bet_skipped' });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: true });
  }, 30_000);

  it('a restored auction room keeps the leader, the bid and the clock', async () => {
    // Точний залишок і продаж годинника, що сплив до знімка, — у manager.restore.test.ts (фейковий годинник); тут — шлях через базу й сокети.
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeRoundsQuiz([auctionRound('a', [withId(single, 'a1')])]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const tarasJoin = await join(first.ctx, started.code, 'Тарас');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    const taras = client(first.port, { code: started.code, role: 'player', token: tarasJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('wager'));
    expect(await send(host, 'host:adjust', { playerId: olenaJoin.playerId, points: 800 })).toEqual({ ok: true });
    expect(await send(host, 'host:adjust', { playerId: tarasJoin.playerId, points: 500 })).toEqual({ ok: true });
    expect(await send(taras, 'player:wager', { amount: 100 })).toEqual({ ok: true });
    expect(await send(olena, 'player:wager', { amount: 200 })).toEqual({ ok: true });

    await first.ctx.shutdown();
    host.last = null;
    const second = await boot(db, 'b', first.port);
    await until(host, (view) => view.role === 'host' && view.phase === 'wager' && view.paused);
    const restored = second.ctx.manager.get(started.code)!.state;
    expect(restored.final?.wagers).toEqual({ [olenaJoin.playerId]: 200 });
    expect(restored.remainingMs).toBeGreaterThan(0);
    expect(restored.remainingMs).toBeLessThanOrEqual(AUCTION_BID_MS);
    expect(await send(host, 'host:resume')).toEqual({ ok: true });
    await until(taras, (view) => view.phase === 'wager' && !view.paused);
    // Тарас перебиває після продовження; годинник продає йому.
    expect(await send(taras, 'player:wager', { amount: 300 })).toEqual({ ok: true });
    await until(olena, (view) => view.phase === 'question');
    expect(second.ctx.manager.get(started.code)?.state.plays[0].final?.wagers).toEqual({ [tarasJoin.playerId]: 300 });
    expect(await send(olena, 'player:answer', correct)).toEqual({ ok: false, error: 'bet_skipped' });
  }, 30_000);

  it("a restored room keeps every player's list finds", async () => {
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeQuiz([timedlist]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const tarasJoin = await join(first.ctx, started.code, 'Тарас');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    const taras = client(first.port, { code: started.code, role: 'player', token: tarasJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:list', { word: 'Юпітер', enter: false })).toEqual({ ok: true });
    expect(await send(olena, 'player:list', { word: 'Марс', enter: false })).toEqual({ ok: true });
    expect(await send(taras, 'player:list', { word: 'Плутон', enter: true })).toEqual({ ok: false, error: 'list_miss' });
    expect(await send(taras, 'player:list', { word: 'Земля', enter: true })).toEqual({ ok: true });
    const before = first.ctx.manager.get(started.code)!.state.plays[0].timedlist;
    expect(before?.present).toEqual([olenaJoin.playerId, tarasJoin.playerId]);
    expect(before?.progress).toEqual({
      [olenaJoin.playerId]: { found: ['l5', 'l4'], wrong: 0 },
      [tarasJoin.playerId]: { found: ['l3'], wrong: 1 },
    });

    await first.ctx.shutdown();
    host.last = olena.last = null;
    const second = await boot(db, 'b', first.port);
    await until(host, (view) => view.role === 'host' && view.phase === 'question' && view.paused);
    expect(second.ctx.manager.get(started.code)!.state.plays[0].timedlist).toEqual(before);
    // Телефон після повторного входу бачить свої клітинки.
    const mine = await until(olena, (view) => view.role === 'player' && view.me.timedlist !== undefined);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.me.timedlist?.found).toEqual([
      { index: 5, text: 'Юпітер' },
      { index: 4, text: 'Марс' },
    ]);
  }, 30_000);

  it('a restored room keeps its set and words', async () => {
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeQuiz([letterwordsRandom]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const tarasJoin = await join(first.ctx, started.code, 'Тарас');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    const taras = client(first.port, { code: started.code, role: 'player', token: tarasJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 2);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    const dealt = first.ctx.manager.get(started.code)!.state.plays[0].letterwords;
    const best = dealt?.best ?? [];
    expect(dealt?.letters).toHaveLength(9);
    expect(best.length).toBeGreaterThan(0);
    // Найдовші можливі слова роздачі — справжні слова словника з цього набору.
    expect(await send(olena, 'player:letters', { word: best[0] })).toEqual({ ok: true });
    expect(await send(taras, 'player:letters', { word: best.at(-1) })).toEqual({ ok: true });
    const before = first.ctx.manager.get(started.code)!.state.plays[0].letterwords;
    expect(before?.progress).toEqual({ [olenaJoin.playerId]: { words: [best[0]] }, [tarasJoin.playerId]: { words: [best.at(-1)] } });

    await first.ctx.shutdown();
    host.last = olena.last = null;
    const second = await boot(db, 'b', first.port);
    await until(host, (view) => view.role === 'host' && view.phase === 'question' && view.paused);
    // Той самий набір, ті самі найкращі слова й слова гравців: другої роздачі не було.
    expect(second.ctx.manager.get(started.code)!.state.plays[0].letterwords).toEqual(before);
    const mine = await until(olena, (view) => view.role === 'player' && view.me.letterwords !== undefined);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.question?.letterwords?.letters).toEqual(before?.letters);
    expect(mine.me.letterwords?.words.map((w) => w.text)).toEqual([best[0]]);
  }, 30_000);

  it('a restored room keeps the picks', async () => {
    const db = await createTestDb();
    const first = await boot(db, 'a');
    const { game: started } = await startGame(first.ctx.app, makeQuiz([moreless]));
    const olenaJoin = await join(first.ctx, started.code, 'Олена');
    const host = client(first.port, { code: started.code, role: 'host', token: started.hostToken });
    const olena = client(first.port, { code: started.code, role: 'player', token: olenaJoin.token });
    await until(host, (view) => view.role === 'host' && view.players.filter((p) => p.connected).length === 1);

    expect(await send(host, 'host:start')).toEqual({ ok: true });
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    await until(olena, inPhase('question'));
    expect(await send(olena, 'player:moreless', { index: 0, pick: 'a' })).toEqual({ ok: true });
    expect(await send(olena, 'player:moreless', { index: 1, pick: 'a' })).toEqual({ ok: true });
    const before = first.ctx.manager.get(started.code)!.state.plays[0].moreless;
    expect(before?.progress).toEqual({ [olenaJoin.playerId]: { picks: ['a', 'a'] } });

    await first.ctx.shutdown();
    host.last = olena.last = null;
    const second = await boot(db, 'b', first.port);
    await until(host, (view) => view.role === 'host' && view.phase === 'question' && view.paused);
    expect(second.ctx.manager.get(started.code)!.state.plays[0].moreless).toEqual(before);
    const mine = await until(olena, (view) => view.role === 'player' && view.me.moreless !== undefined);
    if (mine.role !== 'player') throw new Error('not a player');
    expect(mine.me.moreless?.picks).toEqual(['a', 'a']);
    expect(await send(host, 'host:resume')).toEqual({ ok: true });
    expect(await send(olena, 'player:moreless', { index: 2, pick: 'a' })).toEqual({ ok: true });
    expect(second.ctx.manager.get(started.code)!.state.plays[0].answers[olenaJoin.playerId]).toMatchObject({ grade: 'partial', points: 300 });
  }, 30_000);

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

  it('a malformed code is refused as unauthorized without looking it up in the database', async () => {
    const db = await createTestDb();
    const { ctx, port } = await boot(db, 'a');
    const locate = vi.spyOn(ctx.store!, 'locate');
    for (const code of ['abc', '12345', '1234567', '12a456', ' 12345']) {
      expect(await attempt(port, { code, role: 'player', token: 'x' }), code).toBe('unauthorized');
    }
    expect(locate).not.toHaveBeenCalled();
    expect(await attempt(port, { code: '000000', role: 'player', token: 'x' })).toBe('unauthorized');
    expect(locate).toHaveBeenCalledTimes(1);
  });
  it('a shutdown that starts while the code is being looked up refuses the socket with restarting', async () => {
    const db = await createTestDb();
    const { ctx, port } = await boot(db, 'a');
    const { game: started } = await startGame(ctx.app, makeQuiz([single, text]));
    const original = ctx.store!.locate.bind(ctx.store!);
    vi.spyOn(ctx.store!, 'locate').mockImplementation(async (code) => {
      const where = await original(code);
      ctx.manager.freeze();
      return where;
    });
    expect(await attempt(port, { code: started.code, role: 'host', token: started.hostToken })).toBe('restarting');
  });

  it('limits database lookups of unknown codes per address; known codes are not counted', async () => {
    const db = await createTestDb();
    const { ctx, port } = await boot(db, 'a');
    const { game: started } = await startGame(ctx.app, makeQuiz([single, text]));
    const locate = vi.spyOn(ctx.store!, 'locate');
    for (let i = 0; i < LOOKUPS_PER_MINUTE; i += 1) {
      expect(await attempt(port, { code: String(100000 + i), role: 'player', token: 'x' })).toBe('unauthorized');
    }
    expect(await attempt(port, { code: '999999', role: 'player', token: 'x' })).toBe('restarting');
    expect(locate).toHaveBeenCalledTimes(LOOKUPS_PER_MINUTE);
    expect(await attempt(port, { code: started.code, role: 'host', token: started.hostToken })).toBe('state:lobby');
  });

  it('takes the client address from X-Forwarded-For only as far as the proxies are trusted', () => {
    const socket = (forwarded?: string) => ({
      handshake: { address: '10.0.0.1', headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } },
    });
    expect(clientAddress(socket('1.1.1.1, 2.2.2.2'), false)).toBe('10.0.0.1');
    expect(clientAddress(socket(), 1)).toBe('10.0.0.1');
    expect(clientAddress(socket('1.1.1.1, 2.2.2.2'), true)).toBe('1.1.1.1');
    expect(clientAddress(socket('1.1.1.1, 2.2.2.2'), 1)).toBe('2.2.2.2');
    expect(clientAddress(socket('1.1.1.1, 2.2.2.2'), 2)).toBe('1.1.1.1');
    expect(clientAddress(socket('1.1.1.1'), 5)).toBe('1.1.1.1');
  });
});
