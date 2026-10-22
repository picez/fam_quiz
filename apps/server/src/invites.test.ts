import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { buildApp } from './app';
import { follow } from './db/schema';
import { Invites } from './invites';
import { LOBBY_TTL_MS } from './rooms/manager';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { FakeScheduler } from './testing/fake-scheduler';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof createTestDb>>;
let scheduler: FakeScheduler;
let galyna: Awaited<ReturnType<typeof signUp>>;
let olya: Awaited<ReturnType<typeof signUp>>;
let taras: Awaited<ReturnType<typeof signUp>>;
let vira: Awaited<ReturnType<typeof signUp>>;
let galynaId: string;
let olyaId: string;
let tarasId: string;
let viraId: string;

const request = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });
const idOf = async (cookie: string) => ((await request('GET', '/api/me', cookie)).json() as { id: string }).id;
const newGame = async () => (await startGame(ctx.app, makeQuiz([single]), galyna.cookie)).game.code;
const invite = (code: string, userIds: string[], cookie = galyna.cookie) =>
  request('POST', `/api/games/by-code/${code}/invites`, cookie, { userIds });
const invitesOf = async (cookie: string) => (await request('GET', '/api/me/invites', cookie)).json() as { code: string }[];

beforeAll(async () => {
  db = await createTestDb();
  scheduler = new FakeScheduler();
  ctx = await buildApp({ db, auth: TEST_AUTH, scheduler });
  galyna = await signUp(ctx.app, 'Галина');
  olya = await signUp(ctx.app, 'Оля');
  taras = await signUp(ctx.app, 'Тарас');
  vira = await signUp(ctx.app, 'Віра');
  [galynaId, olyaId, tarasId, viraId] = await Promise.all([galyna, olya, taras, vira].map((u) => idOf(u.cookie)));
  await db.insert(follow).values([
    { followerId: galynaId, followeeId: olyaId },
    { followerId: galynaId, followeeId: tarasId },
  ]);
});

afterAll(async () => {
  await ctx.app.close();
});

describe('invites', () => {
  it('only the host invites, only their friends, and the invitee sees no email', async () => {
    const code = await newGame();
    const post = (cookie: string | undefined, userIds: string[]) =>
      request('POST', `/api/games/by-code/${code}/invites`, cookie, { userIds });
    expect((await post(undefined, [olyaId])).statusCode).toBe(401);
    const stranger = await post(vira.cookie, [olyaId]);
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual({ error: 'game_not_found' });
    expect((await request('GET', `/api/games/by-code/${code}/invites`, olya.cookie)).statusCode).toBe(404);
    expect((await request('GET', `/api/games/by-code/${code}/invites`)).statusCode).toBe(401);
    expect((await post(galyna.cookie, [olyaId])).statusCode).toBe(200);
    expect((await request('POST', '/api/games/by-code/999999x/invites', galyna.cookie, { userIds: [olyaId] })).statusCode).toBe(404);

    const sent = await post(galyna.cookie, [olyaId, viraId, galynaId, olyaId]);
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toEqual({ invited: [olyaId] });
    expect((await post(galyna.cookie, [])).statusCode).toBe(400);
    expect((await request('POST', `/api/games/by-code/${code}/invites`, galyna.cookie, { userIds: [olyaId], extra: 1 })).statusCode).toBe(400);
    expect((await post(galyna.cookie, ['x'.repeat(65)])).statusCode).toBe(400);
    expect((await request('GET', `/api/games/by-code/${code}/invites`, galyna.cookie)).json()).toEqual({ invited: [olyaId] });

    const mine = await request('GET', '/api/me/invites', olya.cookie);
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual([
      { code, title: 'Тестова вікторина', host: { id: galynaId, nickname: 'Галина', avatar: null }, invitedAt: expect.any(String) },
    ]);
    expect(mine.body).not.toContain(galyna.email);
    expect((await request('GET', '/api/me/invites', vira.cookie)).json()).toEqual([]);
    expect((await request('GET', '/api/me/invites')).statusCode).toBe(401);
    expect((await request('DELETE', `/api/me/invites/${code}`)).statusCode).toBe(401);
  });

  it('invites vanish when the game starts or the room closes', async () => {
    const started = await newGame();
    await invite(started, [olyaId]);
    expect((await invitesOf(olya.cookie)).map((i) => i.code)).toContain(started);
    const joined = await request('POST', `/api/games/by-code/${started}/join`, undefined, { nickname: 'Гість' });
    expect(joined.statusCode).toBe(201);
    const room = ctx.manager.get(started)!;
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
    expect((await invitesOf(olya.cookie)).map((i) => i.code)).not.toContain(started);
    const late = await invite(started, [tarasId]);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'wrong_phase' });
    expect((await request('GET', `/api/games/by-code/${started}/invites`, galyna.cookie)).json()).toEqual({ invited: [] });

    const waiting = await newGame();
    await invite(waiting, [olyaId]);
    expect((await invitesOf(olya.cookie)).map((i) => i.code)).toContain(waiting);
    scheduler.advance(LOBBY_TTL_MS);
    expect(ctx.manager.get(waiting)).toBeUndefined();
    expect(await invitesOf(olya.cookie)).toEqual([]);
    expect((await invite(waiting, [olyaId])).statusCode).toBe(404);
  });

  it('a reused code does not resurrect an old invite', async () => {
    const invites = new Invites(ctx.manager);
    const oldRoom = ctx.manager.get(await newGame())!;
    expect(invites.invite(oldRoom, [olyaId])).toEqual([olyaId]);
    expect(invites.forUser(olyaId).map((i) => i.room)).toEqual([oldRoom]);
    scheduler.advance(LOBBY_TTL_MS);
    const second = ctx.manager.get(await newGame())!;
    expect(invites.forUser(olyaId)).toEqual([]);
    expect(invites.invitedTo(oldRoom)).toEqual([]);
    expect(invites.invitedTo(second)).toEqual([]);
  });

  it('caps the invitees of one room', async () => {
    const invites = new Invites(ctx.manager);
    const room = ctx.manager.get(await newGame())!;
    const many = Array.from({ length: 40 }, (_, i) => `user-${i}`);
    expect(invites.invite(room, many)).toHaveLength(30);
    expect(invites.invite(room, ['one-more'])).toHaveLength(30);
    expect(invites.invitedTo(room)).not.toContain('one-more');
  });

  it('a dismissed invite stays dismissed and a joined friend no longer sees it', async () => {
    const code = await newGame();
    expect((await invite(code, [olyaId, tarasId])).json()).toEqual({ invited: [olyaId, tarasId] });
    expect((await request('DELETE', `/api/me/invites/${code}`, olya.cookie)).statusCode).toBe(204);
    expect((await request('DELETE', '/api/me/invites/000000', olya.cookie)).statusCode).toBe(204);
    expect(await invitesOf(olya.cookie)).toEqual([]);
    expect((await invite(code, [olyaId])).json()).toEqual({ invited: [olyaId, tarasId] });
    expect(await invitesOf(olya.cookie)).toEqual([]);

    expect((await invitesOf(taras.cookie)).map((i) => i.code)).toEqual([code]);
    const joined = await request('POST', `/api/games/by-code/${code}/join`, taras.cookie, { nickname: 'Тарас' });
    expect(joined.statusCode).toBe(201);
    expect(await invitesOf(taras.cookie)).toEqual([]);

    const other = await newGame();
    await invite(other, [tarasId]);
    expect((await invitesOf(taras.cookie)).map((i) => i.code)).toEqual([other]);
    expect((await request('DELETE', `/api/me/friends/${tarasId}`, galyna.cookie)).statusCode).toBe(204);
    expect(await invitesOf(taras.cookie)).toEqual([]);
  });

  it('a kicked player does not get the invite back', async () => {
    const code = await newGame();
    await invite(code, [olyaId]);
    const joined = await request('POST', `/api/games/by-code/${code}/join`, olya.cookie, { nickname: 'Оля' });
    expect(joined.statusCode).toBe(201);
    const { playerId } = joined.json() as { playerId: string };
    const room = ctx.manager.get(code)!;
    expect(ctx.manager.host(room, { type: 'kick', playerId })).toEqual({ ok: true });
    expect([...room.playerUsers.values()]).not.toContain(olyaId);
    expect(await invitesOf(olya.cookie)).toEqual([]);
    expect((await invite(code, [olyaId])).json()).toEqual({ invited: [olyaId] });
    expect(await invitesOf(olya.cookie)).toEqual([]);
  });

  it('lists the newest invites first', async () => {
    const first = await newGame();
    await invite(first, [olyaId]);
    scheduler.advance(1000);
    const second = await newGame();
    await invite(second, [olyaId]);
    const codes = (await invitesOf(olya.cookie)).map((i) => i.code);
    expect(codes.indexOf(second)).toBeLessThan(codes.indexOf(first));
  });
});
