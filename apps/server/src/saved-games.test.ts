import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { classicRound, makeRoundsQuiz, single, withId } from '@quiz/engine/testing';
import type { ContinueResponse, GameSummary, SlotsResponse } from '@quiz/shared';
import { buildApp } from './app';
import type { Db } from './db/client';
import { answer, game, participant, savedGame, user } from './db/schema';
import { savedMode } from './saved-games';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { toEnd, toQuestion } from './testing/team-game';
import { isSavedGameData } from './rooms/continuation';

// Підміна лише для тесту «гонки» продовження: за замовчуванням справжній trimToCheckpoint.
const trimHook = vi.hoisted(() => ({ after: null as null | (() => Promise<void>) }));
vi.mock('./recorder', async (importOriginal) => {
  const original = await importOriginal<typeof import('./recorder')>();
  return {
    ...original,
    trimToCheckpoint: async (...args: Parameters<typeof original.trimToCheckpoint>) => {
      await original.trimToCheckpoint(...args);
      await trimHook.after?.();
    },
  };
});

const quizOf = () =>
  makeRoundsQuiz([
    classicRound('r0', [single, withId(single, 'q2')], { speedBonus: false }),
    classicRound('r1', [withId(single, 'q3'), withId(single, 'q4')], { speedBonus: false }),
  ]);
const right = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;
const NO_SLOT = '00000000-0000-4000-8000-000000000000';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function account(name: string) {
  const made = await signUp(ctx.app, name);
  const [row] = await db.select().from(user).where(eq(user.email, made.email));
  return { ...made, id: row.id };
}

/** Гра з ведучим: Оля (можливо з акаунтом) і Петро входять, перше запитання закрито, друге відкрито, ведучий зберігає. */
async function makeSaved(owner: { cookie: string }, options: { olaCookie?: string } = {}) {
  const quizId = ((await call('POST', '/api/quizzes', owner.cookie, quizOf())).json() as { id: string }).id;
  const created = (await call('POST', '/api/games', owner.cookie, { quizId })).json() as { gameId: string; code: string };
  const room = ctx.manager.get(created.code)!;
  const joinAs = async (nickname: string, cookie?: string) => {
    const { playerId } = (await call('POST', `/api/games/by-code/${created.code}/join`, cookie, { nickname })).json() as { playerId: string };
    ctx.manager.connect(room, { role: 'player', playerId });
    return playerId;
  };
  const olaId = await joinAs('Оля', options.olaCookie);
  const petroId = await joinAs('Петро');
  expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  toQuestion(ctx.manager, room);
  ctx.manager.answer(room, olaId, right);
  ctx.manager.answer(room, petroId, wrong);
  ctx.manager.host(room, { type: 'lock' });
  expect(ctx.manager.host(room, { type: 'next' })).toEqual({ ok: true });
  toQuestion(ctx.manager, room);
  expect(room.state.phase).toBe('question');
  expect(ctx.manager.host(room, { type: 'save' })).toEqual({ ok: true });
  await ctx.recorder.idle();
  return { ...created, quizId, olaId, petroId };
}

const listOf = async (cookie: string) => (await call('GET', '/api/games', cookie)).json() as GameSummary[];

describe('GET /api/games lists saved games first', () => {
  it('puts the saved game first with its mode, openness and questions played; the finished one below has no «saved»', async () => {
    const owner = await account('Ведуча');
    const old = await makeSaved(owner);
    await db.update(game).set({ status: 'finished', finishedAt: new Date() }).where(eq(game.id, old.gameId));
    const fresh = await makeSaved(owner);
    const list = await listOf(owner.cookie);
    expect(list.map((g) => g.id)).toEqual([fresh.gameId, old.gameId]);
    expect(list[0]).toMatchObject({ status: 'saved', questionsPlayed: 1, saved: { mode: 'exact', open: false } });
    expect(typeof list[0].saved!.savedAt).toBe('string');
    expect(list[1].status).toBe('finished');
    expect(list[1].saved).toBeUndefined();
  });

  it('a stranger does not see the saved game; no session is 401', async () => {
    const owner = await account('Ведуча');
    await makeSaved(owner);
    const other = await account('Інша');
    expect(await listOf(other.cookie)).toEqual([]);
    expect((await call('GET', '/api/games')).statusCode).toBe(401);
  });
});

describe('POST /api/games/:id/continue and DELETE', () => {
  it('opens the room over the same game id; a second continue and a delete are refused while it is open', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    const response = await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie);
    expect(response.statusCode).toBe(201);
    const body = response.json() as ContinueResponse;
    expect(body.gameId).toBe(saved.gameId);
    expect(body.code).not.toBe(saved.code);
    expect(body).toHaveProperty('hostToken');
    expect(ctx.manager.get(body.code)?.id).toBe(saved.gameId);

    expect((await listOf(owner.cookie))[0].saved).toMatchObject({ mode: 'exact', open: true });
    const again = await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'continue_open' });
    const del = await call('DELETE', `/api/games/${saved.gameId}`, owner.cookie);
    expect(del.statusCode).toBe(409);
    expect(del.json()).toEqual({ error: 'continue_open' });
  });

  it('a delete is refused when a continuation opens between the first check and the delete', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    const [row] = await db.select().from(savedGame).where(eq(savedGame.gameId, saved.gameId));
    const real = ctx.manager.rooms.bind(ctx.manager);
    // Перша перевірка бачить порожньо, а продовження відкривається, поки вона йшла.
    const spy = vi.spyOn(ctx.manager, 'rooms').mockImplementationOnce(() => {
      const opened = ctx.manager.continueSaved(saved.gameId, 'ignored', row.data as never);
      expect(opened.ok).toBe(true);
      return [];
    });
    const del = await call('DELETE', `/api/games/${saved.gameId}`, owner.cookie);
    spy.mockRestore();
    expect(real().some((r) => r.id === saved.gameId)).toBe(true);
    expect(del.statusCode).toBe(409);
    expect(del.json()).toEqual({ error: 'continue_open' });
    expect(await db.select().from(game).where(eq(game.id, saved.gameId))).toHaveLength(1);
  });

  it('a continue bails with 404 and opens nothing when the game stopped being saved while its answers were trimmed', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    trimHook.after = async () => {
      await db.update(game).set({ status: 'finished', finishedAt: new Date() }).where(eq(game.id, saved.gameId));
    };
    try {
      const res = await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie);
      expect(res.statusCode).toBe(404);
    } finally {
      trimHook.after = null;
    }
    expect(ctx.manager.openFor(saved.gameId)).toBe(false);
  });

  it('refuses a stranger, a game that is not saved, a bad id and a missing session', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    const other = await account('Інша');
    expect((await call('POST', `/api/games/${saved.gameId}/continue`, other.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/games/${saved.gameId}`, other.cookie)).statusCode).toBe(404);
    expect((await call('POST', `/api/games/${saved.gameId}/continue`)).statusCode).toBe(401);
    expect((await call('DELETE', `/api/games/${saved.gameId}`)).statusCode).toBe(401);
    expect((await call('POST', '/api/games/not-a-uuid/continue', owner.cookie)).statusCode).toBe(404);
    await db.update(game).set({ status: 'finished', finishedAt: new Date() }).where(eq(game.id, saved.gameId));
    expect((await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/games/${saved.gameId}`, owner.cookie)).statusCode).toBe(404);
  });

  it('delete removes the game, its participants, answers and the saved record', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    expect((await db.select().from(answer).where(eq(answer.participantId, saved.olaId))).length).toBeGreaterThan(0);
    const res = await call('DELETE', `/api/games/${saved.gameId}`, owner.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
    expect(await db.select().from(game).where(eq(game.id, saved.gameId))).toEqual([]);
    expect(await db.select().from(participant).where(eq(participant.gameId, saved.gameId))).toEqual([]);
    expect(await db.select().from(savedGame).where(eq(savedGame.gameId, saved.gameId))).toEqual([]);
    expect(await db.select().from(answer).where(eq(answer.participantId, saved.olaId))).toEqual([]);
    expect((await call('DELETE', `/api/games/${saved.gameId}`, owner.cookie)).statusCode).toBe(404);
  });

  it('after the continuation closes again the game can be continued again', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    const body = (await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie)).json() as ContinueResponse;
    const room = ctx.manager.get(body.code)!;
    ctx.manager.host(room, { type: 'resume' });
    toQuestion(ctx.manager, room);
    expect(ctx.manager.host(room, { type: 'save' })).toEqual({ ok: true });
    await ctx.recorder.idle();
    expect((await listOf(owner.cookie))[0].saved!.open).toBe(false);
    expect((await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie)).statusCode).toBe(201);
  });
});

describe('slots for the join form', () => {
  it('a guest sees the free guest slots, an account sees its own; a claim follows the rules', async () => {
    const owner = await account('Ведуча');
    const ola = await account('Оля');
    const saved = await makeSaved(owner, { olaCookie: ola.cookie });
    const body = (await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie)).json() as ContinueResponse;
    const base = `/api/games/by-code/${body.code}`;

    const guest = (await call('GET', `${base}/slots`)).json() as SlotsResponse;
    expect(guest.slots.map((s) => s.nickname)).toEqual(['Петро']);
    expect(guest.mine).toBeNull();
    const mine = (await call('GET', `${base}/slots`, ola.cookie)).json() as SlotsResponse;
    expect(mine.mine).toMatchObject({ id: saved.olaId, nickname: 'Оля' });
    expect(mine.slots.map((s) => s.nickname)).toEqual(['Петро']);

    const stolen = await call('POST', `${base}/claim`, undefined, { slotId: saved.olaId });
    expect(stolen.statusCode).toBe(403);
    expect(stolen.json()).toEqual({ error: 'not_allowed' });
    const taken = await call('POST', `${base}/claim`, undefined, { slotId: saved.petroId });
    expect(taken.statusCode).toBe(201);
    expect(taken.json()).toMatchObject({ playerId: saved.petroId });
    expect(typeof (taken.json() as { token: string }).token).toBe('string');
    const twice = await call('POST', `${base}/claim`, undefined, { slotId: saved.petroId });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toEqual({ error: 'slot_taken' });
    expect((await call('POST', `${base}/claim`, undefined, { slotId: 'x' })).statusCode).toBe(400);
    expect((await call('POST', `${base}/claim`, undefined, { slotId: NO_SLOT })).statusCode).toBe(404);
    expect((await call('POST', `${base}/claim`, ola.cookie, { slotId: saved.olaId })).statusCode).toBe(201);
  });

  it('a plain room has no slots; an unknown code is 404', async () => {
    const owner = await account('Ведуча');
    const quizId = ((await call('POST', '/api/quizzes', owner.cookie, quizOf())).json() as { id: string }).id;
    const created = (await call('POST', '/api/games', owner.cookie, { quizId })).json() as { code: string };
    expect((await call('GET', `/api/games/by-code/${created.code}/slots`)).json()).toEqual({ slots: [], mine: null });
    const missing = await call('GET', '/api/games/by-code/ZZZZZZ/slots');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'game_not_found' });
    expect((await call('POST', '/api/games/by-code/ZZZZZZ/claim', undefined, { slotId: NO_SLOT })).statusCode).toBe(404);
    expect((await call('POST', `/api/games/by-code/${created.code}/claim`, undefined, { slotId: NO_SLOT })).statusCode).toBe(404);
  });
});

describe('one game', () => {
  it('a continued game played to the end is one finished game in every history', async () => {
    const owner = await account('Ведуча');
    const ola = await account('Оля');
    const saved = await makeSaved(owner, { olaCookie: ola.cookie });
    const body = (await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie)).json() as ContinueResponse;
    const room = ctx.manager.get(body.code)!;
    for (const id of [saved.olaId, saved.petroId]) {
      expect(ctx.manager.claim(body.code, id, id === saved.olaId ? ola.id : null).ok).toBe(true);
      ctx.manager.connect(room, { role: 'player', playerId: id });
    }
    expect(ctx.manager.host(room, { type: 'resume' })).toEqual({ ok: true });
    toQuestion(ctx.manager, room);
    ctx.manager.answer(room, saved.olaId, right);
    ctx.manager.answer(room, saved.petroId, wrong);
    toEnd(ctx.manager, room);
    expect(room.state.phase).toBe('finished');
    await ctx.recorder.idle();

    const list = await listOf(owner.cookie);
    expect(list.filter((g) => g.id === saved.gameId)).toHaveLength(1);
    expect(list.find((g) => g.id === saved.gameId)).toMatchObject({ status: 'finished' });
    expect(list.find((g) => g.id === saved.gameId)!.saved).toBeUndefined();
    const detail = (await call('GET', `/api/games/${saved.gameId}`, owner.cookie)).json() as { standings: { nickname: string; score: number }[] };
    expect(detail.standings.find((s) => s.nickname === 'Оля')!.score).toBeGreaterThan(0);
    // Відповіді обох частин: запитання до збереження й після.
    const rows = await db.select().from(answer).where(eq(answer.participantId, saved.olaId));
    expect(new Set(rows.map((a) => a.questionIndex))).toEqual(new Set([0, 1]));
    const mine = (await call('GET', '/api/me/history', ola.cookie)).json() as unknown[];
    expect(mine).toHaveLength(1);
    expect(await db.select().from(savedGame).where(eq(savedGame.gameId, saved.gameId))).toEqual([]);
  });
});

describe('after a deploy', () => {
  it('an unreadable state version restarts from the round with the points, and the old record goes with the first closed question of the new game', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    await db.update(savedGame).set({ stateVersion: 999 }).where(eq(savedGame.gameId, saved.gameId));
    expect((await listOf(owner.cookie))[0].saved).toMatchObject({ mode: 'restart', open: false });

    const body = (await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie)).json() as ContinueResponse;
    expect(body.gameId).not.toBe(saved.gameId);
    expect((await call('GET', `/api/games/by-code/${body.code}`)).json()).toMatchObject({ phase: 'lobby' });
    const open = await listOf(owner.cookie);
    expect(open.map((g) => g.id)).toEqual([saved.gameId]);
    expect(open[0].saved!.open).toBe(true);
    const [old] = await db.select().from(game).where(eq(game.id, saved.gameId));
    expect(old.status).toBe('saved');

    const room = ctx.manager.get(body.code)!;
    for (const slot of room.state.players) {
      expect(ctx.manager.claim(body.code, slot.id, null).ok).toBe(true);
      ctx.manager.connect(room, { role: 'player', playerId: slot.id });
    }
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    toQuestion(ctx.manager, room);
    ctx.manager.host(room, { type: 'lock' });
    ctx.manager.host(room, { type: 'next' });
    await ctx.recorder.idle();
    expect(await db.select().from(game).where(eq(game.id, saved.gameId))).toEqual([]);
    toEnd(ctx.manager, room);
    await ctx.recorder.idle();
    const list = await listOf(owner.cookie);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(body.gameId);
  });

  it('an unreadable quiz snapshot is blocked: «continue» is 409 cannot_continue and the list still answers', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    await db.update(game).set({ quizSnapshot: { broken: true } }).where(eq(game.id, saved.gameId));
    const listed = await call('GET', '/api/games', owner.cookie);
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as GameSummary[])[0].saved).toMatchObject({ mode: 'blocked' });
    const res = await call('POST', `/api/games/${saved.gameId}/continue`, owner.cookie);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'cannot_continue' });
    expect((await call('DELETE', `/api/games/${saved.gameId}`, owner.cookie)).statusCode).toBe(200);
  });

  it('the save writes a record isSavedGameData accepts', async () => {
    const owner = await account('Ведуча');
    const saved = await makeSaved(owner);
    const [row] = await db.select().from(savedGame).where(eq(savedGame.gameId, saved.gameId));
    expect(isSavedGameData(row.data)).toBe(true);
  });
});

describe('savedMode', () => {
  const quizSnapshot = quizOf();
  const none = { data: null, stateVersion: null, quizSnapshot, autopilot: false, hasAuthor: true };
  it('an unreadable quiz is blocked', () => {
    expect(savedMode({ ...none, quizSnapshot: { broken: true } })).toBe('blocked');
  });
  it('no snapshot or an unreadable version restarts; a bot game restarts only with an author row', () => {
    expect(savedMode(none)).toBe('restart');
    expect(savedMode({ ...none, data: { v: 1, stateVersion: 999, state: { players: [] }, at: 0, playerUsers: [] }, stateVersion: 999 })).toBe('restart');
    expect(savedMode({ ...none, autopilot: true, hasAuthor: false })).toBe('blocked');
    expect(savedMode({ ...none, autopilot: true, hasAuthor: true })).toBe('restart');
  });
});
