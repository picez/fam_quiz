import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { classicRound, makeRoundsQuiz, single } from '@quiz/engine/testing';
import { BOT_USER_ID, defaultTeams, type AckResult, type ClientToServerEvents, type GameView, type HostDrafts, type HostView, type Quiz, type ServerToClientEvents, type SocketAuth } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { buildApp } from './app';
import { ensureBotAccount } from './bot-account';
import { adminAction, user } from './db/schema';
import type { Db } from './db/client';
import { createQuiz } from './quizzes';
import type { Room } from './rooms/manager';
import { TEST_AUTH, signUp } from './testing/accounts';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

// 68: пульт адміна в кімнаті бота через справжній сокет.

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
let scheduler: FakeScheduler;

beforeAll(async () => {
  db = await createTestDb();
  await ensureBotAccount(db);
});

beforeEach(async () => {
  sockets = [];
  scheduler = new FakeScheduler();
  ctx = await buildApp({ db, auth: TEST_AUTH, scheduler });
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

function until(tracked: Tracked, test: (view: GameView) => boolean): Promise<GameView> {
  if (tracked.last !== null && test(tracked.last)) return Promise.resolve(tracked.last);
  return new Promise((resolve) => tracked.waiters.push({ test, resolve }));
}

function send(tracked: Tracked, event: string, ...args: unknown[]): Promise<AckResult> {
  const emit = tracked.socket.emit.bind(tracked.socket) as (event: string, ...args: unknown[]) => void;
  return new Promise((resolve) => emit(event, ...args, resolve));
}

const quiz = (): Quiz => ({ ...makeRoundsQuiz([classicRound('r1', [{ ...single, timeLimit: 30 }, { ...single, id: 'q2', timeLimit: 30 }])]), title: 'Ріки 68' });

/** Кімната бота з Олею й пультом адміна на зв'язку. */
async function botGame() {
  const quizId = await createQuiz(db, BOT_USER_ID, quiz());
  const created = ctx.manager.createBotRoom(quiz(), quizId);
  if (!created.ok) throw new Error(created.error);
  const room: Room = created.room;
  const joined = (await ctx.app.inject({ method: 'POST', url: `/api/games/by-code/${room.code}/join`, payload: { nickname: 'Оля' } })).json() as { token: string; playerId: string };
  const olya = open({ code: room.code, role: 'player', token: joined.token });
  const account = await signUp(ctx.app, 'Адмін 68');
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, account.email));
  const adminId = row!.id;
  const access = ctx.manager.botHostToken(room.code, adminId);
  if (!access.ok) throw new Error(access.error);
  const host = open({ code: room.code, role: 'host', token: access.hostToken });
  await until(host, (view) => view.role === 'host' && view.players.some((p) => p.connected));
  return { room, olya, host, adminId, olyaId: joined.playerId };
}

/** Годинник іде, доки кімната не дійде до фази. */
async function advanceTo(room: Room, phase: GameView['phase']): Promise<void> {
  for (let i = 0; i < 100 && room.state.phase !== phase; i++) scheduler.advance(500);
  expect(room.state.phase).toBe(phase);
}

const logRows = (adminId: string) => db.select().from(adminAction).where(and(eq(adminAction.adminId, adminId)));

describe('the admin host socket of a bot room (68)', () => {
  it('the admin host gets the host view with botHost; a grade is logged, a pacing step is not; save is not allowed', async () => {
    const { room, olya, host, adminId, olyaId } = await botGame();
    expect((host.last as HostView).botHost).toEqual({ manual: false, mine: false });
    expect(ctx.manager.botAct(room.code, 'start')).toEqual({ ok: true });
    await advanceTo(room, 'question');
    await until(olya, (view) => view.phase === 'question');
    expect(await send(olya, 'player:answer', { type: 'single', optionId: 'a' })).toEqual({ ok: true });
    await advanceTo(room, 'reveal');
    expect(await send(host, 'host:override', { playerId: olyaId, grade: 'correct' })).toEqual({ ok: true });
    await vi.waitFor(async () => {
      const rows = await logRows(adminId);
      expect(rows.map((r) => [r.kind, r.details])).toEqual([['bot_room_grade', { title: 'Ріки 68', code: room.code, text: 'Оля ✓' }]]);
    });
    // Режим «Керую сам»: бот кроків не робить, тож після вікна затримки «Далі» адміна діє й рушає гру 
    expect(ctx.manager.botManual(room.code, adminId, true).ok).toBe(true);
    scheduler.advance(10_000);
    const before = room.state.phase;
    expect(before).toBe('reveal');
    expect(await send(host, 'host:next')).toEqual({ ok: true });
    expect(room.state.phase).not.toBe(before);
    expect(await send(host, 'host:save')).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(host, 'host:sounds', { on: false })).toEqual({ ok: false, error: 'not_allowed' });
    // Показ і решта прямих подій пульта доходять до менеджера (рушій сам відповідає за фазу), не forbidden.
    expect(await send(host, 'host:awards')).toEqual({ ok: false, error: 'wrong_phase' });
    // Після «Далі» гра вже не на reveal: підказка доходить до менеджера й відхиляється за фазою.
    expect(await send(host, 'host:hint', { playerId: olyaId, text: 'Річка' })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:ladder-decide', { take: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(await send(host, 'host:pause')).toEqual({ ok: true });
    await vi.waitFor(async () => expect((await logRows(adminId)).map((r) => r.kind).sort()).toEqual(['bot_room_grade', 'bot_room_pause']));
    // Гравець кімнати бота — не автор: дії ведучого, як досі, not_allowed.
    expect(await send(olya, 'host:override', { playerId: olyaId, grade: 'wrong' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(await send(olya, 'host:hint', { playerId: olyaId, text: null })).toEqual({ ok: false, error: 'not_allowed' });
  });

  it("the bot room's own host token opens nothing", async () => {
    const { room } = await botGame();
    const socket: Client = connect(url, { auth: { code: room.code, role: 'host', token: room.hostToken }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('the admin host sees live drafts of a team game', async () => {
    const teamQuiz = (): Quiz => ({ ...makeRoundsQuiz([classicRound('r1', [{ ...single, timeLimit: 30 }])], { teams: defaultTeams(2) }), title: 'Команди 68' });
    const quizId = await createQuiz(db, BOT_USER_ID, teamQuiz());
    const created = ctx.manager.createBotRoom(teamQuiz(), quizId);
    if (!created.ok) throw new Error(created.error);
    const room = created.room;
    const people = [];
    for (const nickname of ['Оля', 'Тарас']) {
      const joined = (await ctx.app.inject({ method: 'POST', url: `/api/games/by-code/${room.code}/join`, payload: { nickname } })).json() as { token: string; playerId: string };
      people.push(open({ code: room.code, role: 'player', token: joined.token }));
    }
    const [olya, taras] = people as [Tracked, Tracked];
    await vi.waitFor(() => expect(room.state.teams!.members.filter((m) => m.connected)).toHaveLength(2));
    const [red, blue] = room.state.teams!.list.map((t) => t.id);
    expect(await send(olya, 'player:team', { teamId: red })).toEqual({ ok: true });
    expect(await send(taras, 'player:team', { teamId: blue })).toEqual({ ok: true });
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, (await signUp(ctx.app, 'Адмін 68')).email));
    const access = ctx.manager.botHostToken(room.code, row!.id);
    if (!access.ok) throw new Error(access.error);
    const host = open({ code: room.code, role: 'host', token: access.hostToken });
    await until(host, (view) => view.role === 'host');
    const batches: HostDrafts[] = [];
    host.socket.on('host:drafts', (batch) => batches.push(batch));
    expect(ctx.manager.botAct(room.code, 'start')).toEqual({ ok: true });
    await advanceTo(room, 'question');
    await until(olya, (view) => view.phase === 'question');
    expect(await send(host, 'host:live-watch', { on: true })).toEqual({ ok: true });
    expect(await send(olya, 'player:draft', { draft: { type: 'single', optionId: 'b' } })).toEqual({ ok: true });
    await vi.waitFor(() => expect(batches.at(-1)?.drafts).toEqual([expect.objectContaining({ id: red, draft: { type: 'single', optionId: 'b' } })]));
  });
});
