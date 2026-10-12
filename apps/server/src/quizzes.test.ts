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

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function createQuiz(cookie: string, title = 'Географія') {
  const response = await call('POST', '/api/quizzes', cookie, { ...makeQuiz([single, text]), title });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

describe('quizzes', () => {
  it('requires a session for every route', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const responses = await Promise.all([
      call('GET', '/api/quizzes'),
      call('POST', '/api/quizzes', undefined, makeQuiz([single])),
      call('GET', `/api/quizzes/${id}`),
      call('PUT', `/api/quizzes/${id}`, undefined, makeQuiz([single])),
      call('DELETE', `/api/quizzes/${id}`),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('saves a quiz and returns it unchanged', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const id = await createQuiz(cookie);
    const response = await call('GET', `/api/quizzes/${id}`, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id, ...makeQuiz([single, text]), title: 'Географія' });
  });

  it('lists the owner’s quizzes with question counts, newest first', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const first = await createQuiz(cookie, 'Перша');
    const second = await createQuiz(cookie, 'Друга');
    await call('PUT', `/api/quizzes/${first}`, cookie, { ...makeQuiz([single]), title: 'Перша, оновлена' });

    const list = (await call('GET', '/api/quizzes', cookie)).json() as { id: string; title: string; questionCount: number }[];
    expect(list.map((item) => [item.id, item.title, item.questionCount])).toEqual([
      [first, 'Перша, оновлена', 1],
      [second, 'Друга', 2],
    ]);
  });

  it('updates and deletes a quiz', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const id = await createQuiz(cookie);

    const updated = await call('PUT', `/api/quizzes/${id}`, cookie, { ...makeQuiz([text]), title: 'Нова назва' });
    expect(updated.statusCode).toBe(200);
    expect((await call('GET', `/api/quizzes/${id}`, cookie)).json()).toMatchObject({ title: 'Нова назва' });

    expect((await call('DELETE', `/api/quizzes/${id}`, cookie)).statusCode).toBe(204);
    expect((await call('GET', `/api/quizzes/${id}`, cookie)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/quizzes/${id}`, cookie)).statusCode).toBe(404);
  });

  it('rejects an invalid quiz on create and on update', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const id = await createQuiz(cookie);
    const invalid = { ...makeQuiz([single]), questions: [] };
    for (const response of [
      await call('POST', '/api/quizzes', cookie, invalid),
      await call('PUT', `/api/quizzes/${id}`, cookie, invalid),
    ]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('hides one user’s quizzes from another user', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const taras = await signUp(ctx.app, 'Тарас');
    const id = await createQuiz(olena.cookie);

    expect((await call('GET', '/api/quizzes', taras.cookie)).json()).toEqual([]);
    expect((await call('GET', `/api/quizzes/${id}`, taras.cookie)).statusCode).toBe(404);
    expect((await call('PUT', `/api/quizzes/${id}`, taras.cookie, makeQuiz([single]))).statusCode).toBe(404);
    expect((await call('DELETE', `/api/quizzes/${id}`, taras.cookie)).statusCode).toBe(404);
    expect((await call('GET', `/api/quizzes/${id}`, olena.cookie)).statusCode).toBe(200);
  });

  it('answers 404 for an id that is not a UUID', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    for (const id of ['abc', '123', "1'; drop table quiz; --"]) {
      const response = await call('GET', `/api/quizzes/${encodeURIComponent(id)}`, cookie);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
  });
});
