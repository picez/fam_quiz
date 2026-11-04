import { randomUUID } from 'node:crypto';
import { makeQuiz, single, withId, bool } from '@quiz/engine/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import { user } from './db/schema';
import { saveLike } from './like-store';
import { createQuiz } from './quizzes';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});
afterAll(async () => {
  await ctx.app.close();
});

const get = (url: string, cookie?: string) => ctx.app.inject({ method: 'GET', url, headers: cookie === undefined ? {} : { cookie } });

describe('GET /api/quizzes/:id/likes (17a)', () => {
  it('gives the owner per-question counts without who liked', async () => {
    const owner = await signUp(ctx.app, 'Автор');
    const other = await signUp(ctx.app, 'Інший');
    const me = (await (await get('/api/me', owner.cookie)).json()) as { id: string };
    const quizId = await createQuiz(db, me.id, makeQuiz([single, withId(bool, 'q2')]));
    const gameId = randomUUID();
    await db.insert(user).values([
      { id: 'o', name: 'О', email: 'o@example.com' },
      { id: 'p', name: 'П', email: 'p@example.com' },
    ]);
    await saveLike(db, { userId: 'o', kind: 'question', liked: true, gameId, quizId, questionId: 'q1' });
    await saveLike(db, { userId: 'p', kind: 'question', liked: true, gameId, quizId, questionId: 'q1' });
    await saveLike(db, { userId: 'o', kind: 'quiz', liked: true, gameId, quizId });

    const response = await get(`/api/quizzes/${quizId}/likes`, owner.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ quiz: 1, questions: { q1: 2 } });
    for (const id of [me.id, 'o', 'p']) expect(response.body).not.toContain(`"${id}"`);

    expect((await get(`/api/quizzes/${quizId}/likes`, other.cookie)).statusCode).toBe(404);
    expect((await get(`/api/quizzes/${quizId}/likes`)).statusCode).toBe(401);
    expect((await get('/api/quizzes/not-a-uuid/likes', owner.cookie)).statusCode).toBe(404);
  });
});

describe('GET /api/me/likes/* (24b)', () => {
  it('given/received only for the signed-in owner, offset validated', async () => {
    const owner = await signUp(ctx.app, 'Автор2');
    const other = await signUp(ctx.app, 'Інший2');
    const ownerId = ((await (await get('/api/me', owner.cookie)).json()) as { id: string }).id;
    const otherId = ((await (await get('/api/me', other.cookie)).json()) as { id: string }).id;
    const quizId = await createQuiz(db, ownerId, makeQuiz([single, withId(bool, 'q2')]));
    await saveLike(db, { userId: otherId, kind: 'question', liked: true, gameId: randomUUID(), quizId, questionId: 'q1' });
    expect((await get('/api/me/likes/given')).statusCode).toBe(401);
    expect((await get('/api/me/likes/received')).statusCode).toBe(401);
    expect((await get('/api/me/likes/given', other.cookie)).json()).toMatchObject({ items: [{ quizId, count: 1 }], next: null });
    expect((await get('/api/me/likes/received', owner.cookie)).json()).toMatchObject({ items: [{ quizId, total: 1, people: 1 }], next: null });
    expect((await get('/api/me/likes/received', other.cookie)).json()).toEqual({ items: [], next: null });
    for (const bad of ['-1', 'abc', '1.5', '10001']) {
      const r = await get(`/api/me/likes/given?offset=${bad}`, other.cookie);
      expect(r.statusCode).toBe(400);
      expect(r.json()).toEqual({ error: 'invalid_payload' });
    }
    expect((await get('/api/me/likes/received?offset=0', owner.cookie)).statusCode).toBe(200);
    expect((await get('/api/me/likes/received', owner.cookie)).body).not.toContain(otherId);
  });
});
