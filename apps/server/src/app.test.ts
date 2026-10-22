import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { buildApp } from './app';
import type { Db } from './db/client';
import { TEST_AUTH, signUp, startGame } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterEach(async () => {
  await ctx.app.close();
});

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

const createGame = async () => (await startGame(ctx.app, makeQuiz([single]))).game;

describe('GET /health', () => {
  it('reports that the server is up', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe('POST /api/games', () => {
  it('creates a room and returns its code and tokens', async () => {
    const { response } = await startGame(ctx.app, makeQuiz([single]));
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.hostToken).toEqual(expect.any(String));
    expect(body.stageToken).toEqual(expect.any(String));
    expect(ctx.manager.get(body.code)?.id).toBe(body.gameId);
  });

  it('does not start a game for a visitor without an account, whatever the body', async () => {
    for (const body of [makeQuiz([single]), { quizId: 'abc' }, {}]) {
      const response = await post('/api/games', body);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'unauthorized' });
    }
    expect(ctx.manager.size).toBe(0);
  });

  it('does not accept a quiz in the body even from a signed-in host', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const response = await ctx.app.inject({ method: 'POST', url: '/api/games', payload: makeQuiz([single]), headers: { cookie } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
    expect(ctx.manager.size).toBe(0);
  });

  it('rejects a body that is not valid JSON with a 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { 'content-type': 'application/json' },
      payload: '{"title": ',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/games/by-code/:code', () => {
  it('describes an existing game without revealing questions', async () => {
    const { code } = await createGame();
    const response = await ctx.app.inject({ method: 'GET', url: `/api/games/by-code/${code}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ phase: 'lobby', title: 'Тестова вікторина' });
  });

  it('answers 404 for an unknown code', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/games/by-code/000000x' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'game_not_found' });
  });
});

describe('POST /api/games/by-code/:code/join', () => {
  it('lets a player in and returns a token that identifies them', async () => {
    const { code } = await createGame();
    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'Олена' });
    expect(response.statusCode).toBe(201);
    const { token, playerId } = response.json();
    expect(ctx.manager.identify(code, 'player', token)?.identity.playerId).toBe(playerId);
  });

  it('answers 409 when the nickname is taken', async () => {
    const { code } = await createGame();
    await post(`/api/games/by-code/${code}/join`, { nickname: 'Олена' });
    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'олена' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'nickname_taken' });
  });

  it('answers 409 when the nickname is only spaces', async () => {
    const { code } = await createGame();
    const response = await post(`/api/games/by-code/${code}/join`, { nickname: '    ' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'nickname_invalid' });
  });

  it('refuses a nickname the database could not store', async () => {
    const { code } = await createGame();
    for (const nickname of ['ab\u0000cd', 'ab\ud800cd']) {
      const response = await post(`/api/games/by-code/${code}/join`, { nickname });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
    expect(ctx.manager.get(code)?.state.players).toEqual([]);
  });

  it('answers 409 when the game has already started', async () => {
    const { code } = await createGame();
    await post(`/api/games/by-code/${code}/join`, { nickname: 'Олена' });
    const room = ctx.manager.get(code);
    if (room === undefined) throw new Error('room missing');
    ctx.manager.host(room, { type: 'start' });

    const response = await post(`/api/games/by-code/${code}/join`, { nickname: 'Тарас' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'wrong_phase' });
  });

  it('answers 404 for an unknown code and 400 for a body without a nickname', async () => {
    const { code } = await createGame();
    expect((await post('/api/games/by-code/000000x/join', { nickname: 'Олена' })).statusCode).toBe(404);
    const invalid = await post(`/api/games/by-code/${code}/join`, { name: 'Олена' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'invalid_payload' });
  });
});

describe('limits', () => {
  it('refuses new games beyond the room cap', async () => {
    const small = await buildApp({ db, auth: TEST_AUTH, maxRooms: 2 });
    const first = await startGame(small.app, makeQuiz([single]));
    const create = () =>
      small.app.inject({ method: 'POST', url: '/api/games', payload: { quizId: first.quizId }, headers: { cookie: first.cookie } });
    expect(first.response.statusCode).toBe(201);
    expect((await create()).statusCode).toBe(201);
    const refused = await create();
    expect(refused.statusCode).toBe(503);
    expect(refused.json()).toEqual({ error: 'server_busy' });
    await small.app.close();
  });

  it('throttles game creation from one address', async () => {
    const first = await startGame(ctx.app, makeQuiz([single]));
    const statuses: number[] = [first.response.statusCode];
    for (let i = 0; i < 20; i++) {
      const again = await ctx.app.inject({
        method: 'POST',
        url: '/api/games',
        payload: { quizId: first.quizId },
        headers: { cookie: first.cookie },
      });
      statuses.push(again.statusCode);
    }
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('counts code checks per client address when running behind a proxy', async () => {
    const proxied = await buildApp({ db, auth: TEST_AUTH, trustProxy: true });
    const { code } = (await startGame(proxied.app, makeQuiz([single]))).game;
    const check = (address: string) =>
      proxied.app.inject({
        method: 'GET',
        url: `/api/games/by-code/${code}`,
        headers: { 'x-forwarded-for': address },
      });

    for (let i = 0; i < 130; i++) expect((await check(`10.0.0.${i}`)).statusCode).toBe(200);

    const sameAddress: number[] = [];
    for (let i = 0; i < 121; i++) sameAddress.push((await check('10.9.9.9')).statusCode);
    expect(sameAddress.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(sameAddress[120]).toBe(429);
    await proxied.app.close();
  });
});

describe('serving the web client', () => {
  it('serves the client for page routes and JSON 404 for unknown API routes', async () => {
    const webRoot = mkdtempSync(joinPath(tmpdir(), 'quiz-web-'));
    writeFileSync(joinPath(webRoot, 'index.html'), '<!doctype html><title>quiz</title>');
    const served = await buildApp({ db, auth: TEST_AUTH, webRoot });

    const page = await served.app.inject({ method: 'GET', url: '/play/123456' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<title>quiz</title>');

    const api = await served.app.inject({ method: 'GET', url: '/api/nothing' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'not_found' });

    expect((await served.app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ ok: true });
    await served.app.close();
  });

  it('pages carry no security policy that would block the YouTube player', async () => {
    const webRoot = mkdtempSync(joinPath(tmpdir(), 'quiz-web-'));
    writeFileSync(joinPath(webRoot, 'index.html'), '<!doctype html><title>quiz</title>');
    const served = await buildApp({ db, auth: TEST_AUTH, webRoot });
    const page = await served.app.inject({ method: 'GET', url: '/play/123456' });
    expect(page.statusCode).toBe(200);
    // If a page CSP is ever added, it must allow frame-src https://www.youtube-nocookie.com.
    expect(page.headers['content-security-policy']).toBeUndefined();
    await served.app.close();
  });

  it('answers JSON 404 for unknown routes when no client is configured', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/play/123456' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
  });
});

describe('client address behind one proxy', () => {
  it('ignores addresses the client wrote into X-Forwarded-For itself', async () => {
    const proxied = await buildApp({ db, auth: TEST_AUTH, trustProxy: 1 });
    const { code } = (await startGame(proxied.app, makeQuiz([single]))).game;
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) {
      const response = await proxied.app.inject({
        method: 'GET',
        url: `/api/games/by-code/${code}`,
        // Проксі дописує справжню адресу останньою; усе перед нею вигадав клієнт.
        headers: { 'x-forwarded-for': `10.9.0.${i}, 203.0.113.7` },
      });
      statuses.push(response.statusCode);
    }
    await proxied.app.close();
    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[124]).toBe(429);
  });
});
