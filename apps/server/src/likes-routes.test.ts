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
