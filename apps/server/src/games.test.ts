import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function hostWithQuiz() {
  const account = await signUp(ctx.app, 'Олена');
  const created = await call('POST', '/api/quizzes', account.cookie, makeQuiz([single, text]));
  return { ...account, quizId: (created.json() as { id: string }).id };
}

describe('starting a game from a saved quiz', () => {
  it('creates a room with the saved quiz for its owner', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const response = await call('POST', '/api/games', cookie, { quizId });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { code: string; hostToken: string; stageToken: string };
    expect(body.code).toMatch(/^\d{6}$/);

    const room = ctx.manager.get(body.code);
    expect(room?.state.quiz.title).toBe('Тестова вікторина');
    expect(room?.state.quiz.questions).toHaveLength(2);
    expect(room?.hostUserId).toEqual(expect.any(String));
  });

  it('requires a session', async () => {
    const { quizId } = await hostWithQuiz();
    const response = await call('POST', '/api/games', undefined, { quizId });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('does not start a game from another user’s quiz or an unknown one', async () => {
    const { quizId } = await hostWithQuiz();
    const stranger = await signUp(ctx.app, 'Тарас');
    for (const id of [quizId, '11111111-1111-4111-8111-111111111111', 'abc']) {
      const response = await call('POST', '/api/games', stranger.cookie, { quizId: id });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
  });

  it('keeps a running game alive when its quiz is deleted', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const { code } = (await call('POST', '/api/games', cookie, { quizId })).json() as { code: string };
    expect((await call('DELETE', `/api/quizzes/${quizId}`, cookie)).statusCode).toBe(204);

    const room = ctx.manager.get(code);
    expect(room?.state.quiz.questions).toHaveLength(2);
    const joined = await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гравець' });
    expect(joined.statusCode).toBe(201);
    if (room === undefined) throw new Error('room missing');
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
  });

  it('still accepts a quiz in the request body without a session', async () => {
    const response = await call('POST', '/api/games', undefined, makeQuiz([single]));
    expect(response.statusCode).toBe(201);
    expect(ctx.manager.get((response.json() as { code: string }).code)?.hostUserId).toBeNull();
  });

  it('rejects a body that is neither a quiz id nor a quiz', async () => {
    const { cookie } = await hostWithQuiz();
    const response = await call('POST', '/api/games', cookie, { quiz: 'none' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_payload' });
  });
});

describe('host access', () => {
  it('gives the host their room tokens again', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const created = (await call('POST', '/api/games', cookie, { quizId })).json() as {
      code: string;
      hostToken: string;
      stageToken: string;
    };
    const response = await call('GET', `/api/games/by-code/${created.code}/host-access`, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hostToken: created.hostToken, stageToken: created.stageToken });
  });

  it('gives nothing to another user, to a visitor, or for an unknown code', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const { code } = (await call('POST', '/api/games', cookie, { quizId })).json() as { code: string };
    const stranger = await signUp(ctx.app, 'Тарас');

    for (const response of [
      await call('GET', `/api/games/by-code/${code}/host-access`, stranger.cookie),
      await call('GET', `/api/games/by-code/${code}/host-access`),
      await call('GET', '/api/games/by-code/000000x/host-access', cookie),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'game_not_found' });
      expect(response.body).not.toContain('Token');
    }
  });

  it('gives nothing for a game created without an account', async () => {
    const { cookie } = await hostWithQuiz();
    const { code } = (await call('POST', '/api/games', undefined, makeQuiz([single]))).json() as { code: string };
    expect((await call('GET', `/api/games/by-code/${code}/host-access`, cookie)).statusCode).toBe(404);
  });
});
