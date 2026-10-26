import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardRound, makeQuiz, makeRoundsQuiz, single, text, withId } from '@quiz/engine/testing';
import { roundQuestions } from '@quiz/shared';
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
    expect(roundQuestions(room!.state.quiz.rounds[0])).toHaveLength(2);
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
    expect(roundQuestions(room!.state.quiz.rounds[0])).toHaveLength(2);
    const joined = await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Гравець' });
    expect(joined.statusCode).toBe(201);
    if (room === undefined) throw new Error('room missing');
    expect(ctx.manager.host(room, { type: 'start' })).toEqual({ ok: true });
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

});

describe('autopilot rooms (11g)', () => {
  const autopilot = (cookie: string | undefined, payload: object) => call('POST', '/api/games', cookie, payload);

  it('creates a room whose author is a player, with no host token', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const response = await autopilot(cookie, { quizId, autopilot: true, nickname: 'Марта' });
    expect(response.statusCode).toBe(201);
    const body = response.json() as Record<string, string>;
    expect(Object.keys(body).sort()).toEqual(['code', 'gameId', 'playerId', 'stageToken', 'token']);
    expect(body.hostToken).toBeUndefined();
    const room = ctx.manager.get(body.code);
    expect(room?.state.autopilot?.authorId).toBe(body.playerId);
    expect(room?.state.players[0].nickname).toBe('Марта');
  });

  it('rejects a missing, empty or stray nickname, and strangers', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const missing = await autopilot(cookie, { quizId, autopilot: true });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({ error: 'invalid_payload' });
    expect((await autopilot(cookie, { quizId, nickname: 'Марта' })).statusCode).toBe(400);
    expect((await autopilot(cookie, { quizId, autopilot: false, nickname: 'Марта' })).statusCode).toBe(400);
    const empty = await autopilot(cookie, { quizId, autopilot: true, nickname: '' });
    expect(empty.statusCode).toBe(409);
    expect(empty.json()).toEqual({ error: 'nickname_invalid' });

    const stranger = await signUp(ctx.app, 'Тарас');
    expect((await autopilot(stranger.cookie, { quizId, autopilot: true, nickname: 'Тарас' })).statusCode).toBe(404);
    expect((await autopilot(undefined, { quizId, autopilot: true, nickname: 'Марта' })).statusCode).toBe(401);
  });

  it('gives no host access to an autopilot room, and others join as usual', async () => {
    const { cookie, quizId } = await hostWithQuiz();
    const { code } = (await autopilot(cookie, { quizId, autopilot: true, nickname: 'Марта' })).json() as { code: string };
    const access = await call('GET', `/api/games/by-code/${code}/host-access`, cookie);
    expect(access.statusCode).toBe(404);
    expect(access.json()).toEqual({ error: 'game_not_found' });
    const joined = await call('POST', `/api/games/by-code/${code}/join`, undefined, { nickname: 'Оля' });
    expect(joined.statusCode).toBe(201);
  });

  it('reads the compatibility of an own quiz', async () => {
    const account = await signUp(ctx.app, 'Олена');
    const cell = (id: string, points: number) => ({ ...withId(single, id), points });
    const category = (title: string, n: number) => ({ title, cells: [cell(`c${n}1`, 100), cell(`c${n}2`, 200), cell(`c${n}3`, 300)] });
    const quiz = makeRoundsQuiz([boardRound('r0', [category('Міста', 1), category('Річки', 2), category('Гори', 3)], { answerMode: 'voice' })]);
    const created = await call('POST', '/api/quizzes', account.cookie, quiz);
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };
    const check = await call('GET', `/api/quizzes/${id}/autopilot`, account.cookie);
    expect(check.statusCode).toBe(200);
    expect(check.json()).toEqual({ blocked: [], changed: [{ code: 'voice', rounds: [0] }] });

    const stranger = await signUp(ctx.app, 'Тарас');
    expect((await call('GET', `/api/quizzes/${id}/autopilot`, stranger.cookie)).statusCode).toBe(404);
    expect((await call('GET', `/api/quizzes/${id}/autopilot`)).statusCode).toBe(401);
  });
});
