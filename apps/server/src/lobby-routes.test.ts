import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import type { ContinueResponse, LobbyRow, SlotsResponse } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { follow, user, userBan } from './db/schema';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { toQuestion } from './testing/team-game';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
let host: Awaited<ReturnType<typeof account>>;
let olya: Awaited<ReturnType<typeof account>>;
let vira: Awaited<ReturnType<typeof account>>;

type Method = 'GET' | 'POST' | 'PUT';
const call = (method: Method, url: string, cookie?: string, payload?: object, app = ctx.app) =>
  app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function account(name: string, app = ctx.app) {
  const made = await signUp(app, name);
  const [row] = await db.select().from(user).where(eq(user.email, made.email));
  return { ...made, id: row.id };
}

const newGame = async () => (await startGame(ctx.app, makeQuiz([single]), host.cookie)).game.code;
const lock = (code: string, password: string | null = 'сова42', visibility = 'all') =>
  call('PUT', `/api/games/by-code/${code}/lobby`, host.cookie, { visibility, password });

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
  host = await account('Ведуча');
  olya = await account('Оля');
  vira = await account('Віра');
  await db.insert(follow).values({ followerId: host.id, followeeId: olya.id });
});

afterAll(async () => {
  await ctx.app.close();
});

describe('lobby settings and password (24c)', () => {
  it('GET …/lobby is the host’s alone', async () => {
    const code = await newGame();
    const mine = await call('GET', `/api/games/by-code/${code}/lobby`, host.cookie);
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual({ visibility: 'friends', password: null });
    for (const cookie of [vira.cookie, undefined]) {
      const other = await call('GET', `/api/games/by-code/${code}/lobby`, cookie);
      expect(other.statusCode).toBe(404);
      expect(other.json()).toEqual({ error: 'game_not_found' });
    }
    expect((await call('GET', '/api/games/by-code/ZZZZZZ/lobby', host.cookie)).statusCode).toBe(404);
  });

  it('PUT …/lobby sets, validates, refuses others and after the start', async () => {
    const code = await newGame();
    const set = await lock(code);
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ visibility: 'all', password: 'сова42' });
    expect((await call('GET', `/api/games/by-code/${code}/lobby`, host.cookie)).json()).toEqual({ visibility: 'all', password: 'сова42' });
    const short = await lock(code, 'abc');
    expect(short.statusCode).toBe(400);
    expect(short.json()).toEqual({ error: 'invalid_payload' });
    expect((await call('PUT', `/api/games/by-code/${code}/lobby`, host.cookie, { visibility: 'nobody', password: null })).statusCode).toBe(400);
    const stranger = await call('PUT', `/api/games/by-code/${code}/lobby`, vira.cookie, { visibility: 'all', password: null });
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'game_not_found' });
    expect((await call('PUT', `/api/games/by-code/${code}/lobby`, undefined, { visibility: 'all', password: null })).statusCode).toBe(404);

    expect((await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гість', password: 'сова42' })).statusCode).toBe(201);
    const room = ctx.manager.get(code)!;
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    const late = await lock(code, null, 'hidden');
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'wrong_phase' });
  });

  it('join asks for the password, refuses a wrong one, lets the right one in, then limits', async () => {
    const code = await newGame();
    await lock(code);
    const join = (payload: object) => call('POST', `/api/games/by-code/${code}/join`, undefined, payload);
    const none = await join({ nickname: 'Гість', device: 'd1' });
    expect(none.statusCode).toBe(403);
    expect(none.json()).toEqual({ error: 'password_required' });
    const wrong = await join({ nickname: 'Гість', password: 'хибний', device: 'd1' });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toEqual({ error: 'password_wrong' });
    expect((await join({ nickname: 'Гість', password: 'сова42', device: 'd1' })).statusCode).toBe(201);
    for (let i = 0; i < 4; i += 1) expect((await join({ nickname: `Г${i}`, password: 'хибний', device: 'd1' })).statusCode).toBe(403);
    const limited = await join({ nickname: 'Гість2', password: 'хибний', device: 'd1' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: 'password_limited' });
    expect((await join({ nickname: 'Гість2', password: 'сова42', device: 'd1' })).statusCode).toBe(429);
  });

  it('GET by code says locked for a guest, not for the host or an invitee, and never leaks the password', async () => {
    const code = await newGame();
    await lock(code);
    expect((await call('POST', `/api/games/by-code/${code}/invites`, host.cookie, { userIds: [olya.id] })).statusCode).toBe(200);
    const guest = await call('GET', `/api/games/by-code/${code}`);
    expect(guest.json()).toEqual({ phase: 'lobby', title: 'Тестова вікторина', locked: true, late: false });
    expect(guest.body).not.toContain('сова42');
    for (const cookie of [host.cookie, olya.cookie]) {
      const response = await call('GET', `/api/games/by-code/${code}`, cookie);
      expect(response.json()).toMatchObject({ locked: false, late: false });
      expect(response.body).not.toContain('сова42');
    }
    expect((await call('GET', `/api/games/by-code/${code}`, vira.cookie)).json()).toMatchObject({ locked: true });
    // Запрошена входить без пароля.
    expect((await call('POST', `/api/games/by-code/${code}/join`, olya.cookie, { nickname: 'Оля' })).statusCode).toBe(201);
  });

  it('claim in a continued game checks the password; by code says late', async () => {
    const quiz = makeRoundsQuiz([
      classicRound('r0', [single, withId(single, 'q2')], { speedBonus: false }),
      classicRound('r1', [withId(single, 'q3')], { speedBonus: false }),
    ]);
    const quizId = ((await call('POST', '/api/quizzes', host.cookie, quiz)).json() as { id: string }).id;
    const created = (await call('POST', '/api/games', host.cookie, { quizId })).json() as { gameId: string; code: string };
    const room = ctx.manager.get(created.code)!;
    for (const nickname of ['Петро', 'Іван']) {
      const { playerId } = (await call('POST', `/api/games/by-code/${created.code}/join`, undefined, { nickname })).json() as { playerId: string };
      ctx.manager.connect(room, { role: 'player', playerId });
    }
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    toQuestion(ctx.manager, room);
    ctx.manager.host(room, { type: 'lock' });
    ctx.manager.host(room, { type: 'next' });
    toQuestion(ctx.manager, room);
    expect(ctx.manager.host(room, { type: 'save' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    const body = (await call('POST', `/api/games/${created.gameId}/continue`, host.cookie)).json() as ContinueResponse;
    const base = `/api/games/by-code/${body.code}`;
    ctx.manager.get(body.code)!.lobby.password = 'сова42';
    expect((await call('GET', base)).json()).toMatchObject({ locked: true, late: true });
    const [slot] = ((await call('GET', `${base}/slots`)).json() as SlotsResponse).slots;
    const refused = await call('POST', `${base}/claim`, undefined, { slotId: slot.id });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'password_required' });
    expect((await call('POST', `${base}/claim`, undefined, { slotId: slot.id, password: 'хибний' })).json()).toEqual({ error: 'password_wrong' });
    expect((await call('POST', `${base}/claim`, undefined, { slotId: slot.id, password: 'сова42' })).statusCode).toBe(201);
  });

  it('password changed', async () => {
    const code = await newGame();
    await lock(code);
    expect((await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гість' })).statusCode).toBe(403);
    expect((await lock(code, null)).statusCode).toBe(200);
    expect((await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гість' })).statusCode).toBe(201);
    expect((await call('GET', `/api/games/by-code/${code}`)).json()).toMatchObject({ locked: false });
  });

  it('rejoin after restore', async () => {
    const own = await createTestDb();
    const first = await buildApp({ db: own, auth: TEST_AUTH, persist: { instanceId: 'a', saveDelayMs: 0 } });
    try {
      const owner = await signUp(first.app, 'Ведуча');
      const player = await signUp(first.app, 'Тарас');
      const code = (await startGame(first.app, makeQuiz([single]), owner.cookie)).game.code;
      expect((await call('PUT', `/api/games/by-code/${code}/lobby`, owner.cookie, { visibility: 'all', password: 'сова42' }, first.app)).statusCode).toBe(200);
      expect((await call('POST', `/api/games/by-code/${code}/join`, player.cookie, { nickname: 'Тарас', password: 'сова42' }, first.app)).statusCode).toBe(201);
      await first.shutdown();
      const second = await buildApp({ db: own, auth: TEST_AUTH, persist: { instanceId: 'b', saveDelayMs: 0 } });
      try {
        expect(second.manager.get(code)?.lobby.password).toBe('сова42');
        const again = await call('POST', `/api/games/by-code/${code}/join`, player.cookie, { nickname: 'Тарас2' }, second.app);
        expect(again.statusCode).not.toBe(403);
        expect(again.statusCode).toBe(201);
        expect((await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гість' }, second.app)).statusCode).toBe(403);
      } finally {
        await second.app.close();
      }
    } finally {
      await first.app.close().catch(() => undefined);
    }
  });
});

describe('GET /api/lobbies (24c)', () => {
  type World = Awaited<ReturnType<typeof world>>;
  let w: World;
  const rowsFor = async (cookie?: string) => (await call('GET', '/api/lobbies', cookie, undefined, w.ctx.app)).json() as LobbyRow[];

  async function world() {
    const wdb = await createTestDb();
    const wctx = await buildApp({ db: wdb, auth: TEST_AUTH });
    const make = async (name: string) => {
      const made = await signUp(wctx.app, name);
      const [row] = await wdb.select().from(user).where(eq(user.email, made.email));
      return { ...made, id: row.id };
    };
    const galyna = await make('Галина');
    const olya2 = await make('Оля');
    const taras = await make('Тарас');
    const petro = await make('Петро');
    await wdb.insert(follow).values([
      { followerId: galyna.id, followeeId: olya2.id },
      { followerId: olya2.id, followeeId: petro.id },
    ]);
    return { db: wdb, ctx: wctx, galyna, olya: olya2, taras, petro };
  }

  const open = async (visibility: string, password: string | null = null) => {
    const code = (await startGame(w.ctx.app, makeQuiz([single]), w.galyna.cookie)).game.code;
    const put = await call('PUT', `/api/games/by-code/${code}/lobby`, w.galyna.cookie, { visibility, password }, w.ctx.app);
    expect(put.statusCode).toBe(200);
    return code;
  };

  beforeEach(async () => {
    w = await world();
  });
  afterEach(async () => {
    await w.ctx.app.close();
  });

  it('visibility', async () => {
    const code = await open('friends');
    expect((await rowsFor(w.olya.cookie)).map((r) => r.code)).toEqual([code]);
    expect(await rowsFor(w.taras.cookie)).toEqual([]);
    expect(await rowsFor()).toEqual([]);
    expect(await rowsFor(w.galyna.cookie)).toEqual([]);
    await call('PUT', `/api/games/by-code/${code}/lobby`, w.galyna.cookie, { visibility: 'all', password: null }, w.ctx.app);
    for (const cookie of [w.olya.cookie, w.taras.cookie, undefined]) expect((await rowsFor(cookie)).map((r) => r.code)).toEqual([code]);
    expect(await rowsFor(w.galyna.cookie)).toEqual([]);
    await call('PUT', `/api/games/by-code/${code}/lobby`, w.galyna.cookie, { visibility: 'hidden', password: null }, w.ctx.app);
    for (const cookie of [w.olya.cookie, w.taras.cookie, undefined]) expect(await rowsFor(cookie)).toEqual([]);
  });

  it('unfollowed', async () => {
    const code = await open('friends');
    expect((await rowsFor(w.olya.cookie)).map((r) => r.code)).toEqual([code]);
    await w.db.delete(follow).where(eq(follow.followerId, w.galyna.id));
    expect(await rowsFor(w.olya.cookie)).toEqual([]);
  });

  it('row', async () => {
    const code = await open('friends', 'сова42');
    await call('POST', `/api/games/by-code/${code}/join`, w.petro.cookie, { nickname: 'Петро', password: 'сова42' }, w.ctx.app);
    const response = await call('GET', '/api/lobbies', w.olya.cookie, undefined, w.ctx.app);
    expect(response.body).not.toContain('сова42');
    const [row] = response.json() as LobbyRow[];
    expect(row).toEqual({
      code,
      title: 'Тестова вікторина',
      host: { id: w.galyna.id, nickname: 'Галина', avatar: null, level: expect.objectContaining({ level: 1, font: null }) },
      players: 1,
      maxPlayers: 50,
      rounds: 1,
      questions: 1,
      truth: false,
      locked: true,
      late: false,
      friends: ['Петро'],
      openedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
    const other = ((await rowsFor(w.taras.cookie)) as LobbyRow[]).length;
    expect(other).toBe(0);
  });

  it('joinable only', async () => {
    const code = await open('all');
    const room = w.ctx.manager.get(code)!;
    await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Іра' }, w.ctx.app);
    expect(await rowsFor(w.taras.cookie)).toHaveLength(1);
    expect(w.ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect(await rowsFor(w.taras.cookie)).toEqual([]);

    const quiz = makeRoundsQuiz([
      classicRound('r0', [single, withId(single, 'q2')], { speedBonus: false }),
      classicRound('r1', [withId(single, 'q3')], { speedBonus: false }),
    ]);
    const quizId = ((await call('POST', '/api/quizzes', w.galyna.cookie, quiz, w.ctx.app)).json() as { id: string }).id;
    const created = (await call('POST', '/api/games', w.galyna.cookie, { quizId }, w.ctx.app)).json() as { gameId: string; code: string };
    const first = w.ctx.manager.get(created.code)!;
    for (const nickname of ['Іван', 'Марко']) {
      const { playerId } = (await call('POST', `/api/games/by-code/${created.code}/join`, undefined, { nickname }, w.ctx.app)).json() as { playerId: string };
      w.ctx.manager.connect(first, { role: 'player', playerId });
    }
    expect(w.ctx.manager.host(first, { type: 'start' })).toEqual({ ok: true });
    toQuestion(w.ctx.manager, first);
    expect(w.ctx.manager.host(first, { type: 'save' })).toEqual({ ok: true });
    await w.ctx.recorder.idle();
    const body = (await call('POST', `/api/games/${created.gameId}/continue`, w.galyna.cookie, undefined, w.ctx.app)).json() as ContinueResponse;
    w.ctx.manager.get(body.code)!.lobby.visibility = 'all';
    const rows = await rowsFor(w.taras.cookie);
    expect(rows.map((r) => [r.code, r.late])).toEqual([[body.code, true]]);
    const done = w.ctx.manager.get(body.code)!;
    done.state = { ...done.state, phase: 'finished' };
    expect(await rowsFor(w.taras.cookie)).toEqual([]);
  });

  it('banned host', async () => {
    await open('all');
    expect(await rowsFor(w.taras.cookie)).toHaveLength(1);
    await w.db.insert(userBan).values({ userId: w.galyna.id, bannedAt: new Date() });
    expect(await rowsFor(w.taras.cookie)).toEqual([]);
  });

  it('order and cap', async () => {
    const older = await open('all');
    const newer = await open('all');
    w.ctx.manager.get(older)!.lobby.openedAt = 1_000;
    w.ctx.manager.get(newer)!.lobby.openedAt = 2_000;
    expect((await rowsFor(w.taras.cookie)).map((r) => r.code)).toEqual([newer, older]);
    const filler = () => {
      const { lobby } = w.ctx.manager.create(makeQuiz([single]), w.galyna.id);
      lobby.visibility = 'all';
      lobby.openedAt = 500;
    };
    for (let i = 0; i < 49; i += 1) filler();
    const rows = await rowsFor(w.taras.cookie);
    expect(rows).toHaveLength(50);
    expect(rows[0].code).toBe(newer);
    filler();
    expect(await rowsFor(w.taras.cookie)).toHaveLength(50);
  });
});
