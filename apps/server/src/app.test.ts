import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { buildApp } from './app';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  ctx = await buildApp();
});

afterEach(async () => {
  await ctx.app.close();
});

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

async function createGame() {
  const response = await post('/api/games', makeQuiz([single]));
  return response.json() as { gameId: string; code: string; hostToken: string; stageToken: string };
}

describe('GET /health', () => {
  it('reports that the server is up', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe('POST /api/games', () => {
  it('creates a room and returns its code and tokens', async () => {
    const response = await post('/api/games', makeQuiz([single]));
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.hostToken).toEqual(expect.any(String));
    expect(body.stageToken).toEqual(expect.any(String));
    expect(ctx.manager.get(body.code)?.id).toBe(body.gameId);
  });

  it('rejects an invalid quiz', async () => {
    const response = await post('/api/games', { ...makeQuiz([single]), questions: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
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
