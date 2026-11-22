import { makeQuiz, single } from '@quiz/engine/testing';
import { QUIZ_FOLDER_LIMITS, type QuizFolder } from '@quiz/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { Db } from './db/client';
import { quizFolder } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

const UNKNOWN = '11111111-1111-4111-8111-111111111111';

let db: Db;
let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });

async function newQuiz(cookie: string, title = 'Географія'): Promise<string> {
  const response = await call('POST', '/api/quizzes', cookie, { ...makeQuiz([single]), title });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function newFolder(cookie: string, name: string): Promise<QuizFolder> {
  const response = await call('POST', '/api/quiz-folders', cookie, { name });
  expect(response.statusCode).toBe(201);
  return response.json() as QuizFolder;
}

const folders = async (cookie: string) => (await call('GET', '/api/quiz-folders', cookie)).json() as QuizFolder[];
const quizzes = async (cookie: string) => (await call('GET', '/api/quizzes', cookie)).json() as { id: string; folderId: string | null; createdAt: string }[];

describe('quiz folder routes (73)', () => {
  it('a guest gets 401 on every route and nothing changes', async () => {
    const before = await db.select().from(quizFolder);
    const responses = await Promise.all([
      call('GET', '/api/quiz-folders'),
      call('POST', '/api/quiz-folders', undefined, { name: 'Кіно' }),
      call('PUT', `/api/quiz-folders/${UNKNOWN}`, undefined, { name: 'Кіно' }),
      call('PUT', '/api/quiz-folders/order', undefined, { ids: [] }),
      call('DELETE', `/api/quiz-folders/${UNKNOWN}`),
      call('PUT', `/api/quizzes/${UNKNOWN}/folder`, undefined, { folderId: null }),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'unauthorized' });
    }
    expect(await db.select().from(quizFolder)).toEqual(before);
  });

  it('lists own folders by position; another person sees none of them', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const petro = await signUp(ctx.app, 'Петро');
    expect(await folders(olena.cookie)).toEqual([]);
    const films = await newFolder(olena.cookie, 'Кіно');
    const asia = await newFolder(olena.cookie, 'Для Асі');
    expect(await folders(olena.cookie)).toEqual([
      { id: films.id, name: 'Кіно', position: 0, createdAt: films.createdAt },
      { id: asia.id, name: 'Для Асі', position: 1, createdAt: asia.createdAt },
    ]);
    expect(await folders(petro.cookie)).toEqual([]);
  });

  it('creates with a trimmed name; a repeat in another case, a bad name or the 31st are refused', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const created = await call('POST', '/api/quiz-folders', cookie, { name: ' Кіно ' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'Кіно', position: 0 });

    const repeat = await call('POST', '/api/quiz-folders', cookie, { name: 'кіно' });
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json()).toEqual({ error: 'folder_name_taken' });

    for (const payload of [{ name: '' }, { name: '   ' }, { name: 'а'.repeat(41) }, { name: 'Кіно 2', extra: 1 }, {}]) {
      const bad = await call('POST', '/api/quiz-folders', cookie, payload);
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: 'invalid_payload' });
    }

    for (let i = 1; i < QUIZ_FOLDER_LIMITS.perOwner; i += 1) await newFolder(cookie, `Папка ${i}`);
    const full = await call('POST', '/api/quiz-folders', cookie, { name: 'Ще одна' });
    expect(full.statusCode).toBe(409);
    expect(full.json()).toEqual({ error: 'folders_full' });
  });

  it('renames own; foreign, unknown or not a UUID → 404', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const petro = await signUp(ctx.app, 'Петро');
    const films = await newFolder(olena.cookie, 'Кіно');
    await newFolder(olena.cookie, 'Для Асі');

    const renamed = await call('PUT', `/api/quiz-folders/${films.id}`, olena.cookie, { name: '  Фільми ' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toEqual({ ...films, name: 'Фільми' });

    const taken = await call('PUT', `/api/quiz-folders/${films.id}`, olena.cookie, { name: 'для асі' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'folder_name_taken' });

    expect((await call('PUT', `/api/quiz-folders/${films.id}`, olena.cookie, { name: '' })).statusCode).toBe(400);
    for (const [cookie, id] of [
      [petro.cookie, films.id],
      [olena.cookie, UNKNOWN],
      [olena.cookie, 'not-a-uuid'],
    ] as const) {
      const response = await call('PUT', `/api/quiz-folders/${id}`, cookie, { name: 'Моє' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
  });

  it('reorders the full set; an incomplete set → 409; repeats → 400 (the static order path is not an id)', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const a = await newFolder(cookie, 'А');
    const b = await newFolder(cookie, 'Б');

    const reordered = await call('PUT', '/api/quiz-folders/order', cookie, { ids: [b.id, a.id] });
    expect(reordered.statusCode).toBe(200);
    expect((reordered.json() as QuizFolder[]).map((f) => [f.name, f.position])).toEqual([['Б', 0], ['А', 1]]);
    expect((await folders(cookie)).map((f) => f.name)).toEqual(['Б', 'А']);

    const partial = await call('PUT', '/api/quiz-folders/order', cookie, { ids: [a.id] });
    expect(partial.statusCode).toBe(409);
    expect(partial.json()).toEqual({ error: 'folders_changed' });

    const repeats = await call('PUT', '/api/quiz-folders/order', cookie, { ids: [a.id, a.id] });
    expect(repeats.statusCode).toBe(400);
    expect(repeats.json()).toEqual({ error: 'invalid_payload' });
    expect((await folders(cookie)).map((f) => f.name)).toEqual(['Б', 'А']);
  });

  it('deletes own folder; its quizzes stay without a folder; a foreign one → 404', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const petro = await signUp(ctx.app, 'Петро');
    const films = await newFolder(olena.cookie, 'Кіно');
    const quizId = await newQuiz(olena.cookie);
    expect((await call('PUT', `/api/quizzes/${quizId}/folder`, olena.cookie, { folderId: films.id })).statusCode).toBe(200);

    expect((await call('DELETE', `/api/quiz-folders/${films.id}`, petro.cookie)).statusCode).toBe(404);
    const deleted = await call('DELETE', `/api/quiz-folders/${films.id}`, olena.cookie);
    expect(deleted.statusCode).toBe(204);
    expect((await quizzes(olena.cookie)).find((q) => q.id === quizId)?.folderId).toBeNull();
    expect((await call('DELETE', `/api/quiz-folders/${films.id}`, olena.cookie)).statusCode).toBe(404);
  });

  it('moves own quiz into own folder or none; foreign quiz or folder → 404; a bad body → 400', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const petro = await signUp(ctx.app, 'Петро');
    const films = await newFolder(olena.cookie, 'Кіно');
    const theirs = await newFolder(petro.cookie, 'Петрове');
    const quizId = await newQuiz(olena.cookie);
    const petroQuiz = await newQuiz(petro.cookie);

    const moved = await call('PUT', `/api/quizzes/${quizId}/folder`, olena.cookie, { folderId: films.id });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toEqual({ folderId: films.id });
    expect(await quizzes(olena.cookie)).toEqual([expect.objectContaining({ id: quizId, folderId: films.id, createdAt: expect.any(String) })]);

    const out = await call('PUT', `/api/quizzes/${quizId}/folder`, olena.cookie, { folderId: null });
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ folderId: null });

    for (const [cookie, id, folderId] of [
      [olena.cookie, quizId, theirs.id],
      [olena.cookie, petroQuiz, films.id],
      [olena.cookie, petroQuiz, null],
      [olena.cookie, UNKNOWN, null],
      [olena.cookie, 'not-a-uuid', null],
    ] as const) {
      const response = await call('PUT', `/api/quizzes/${id}/folder`, cookie, { folderId });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }

    for (const payload of [{}, { folderId: '' }, { folderId: null, extra: 1 }]) {
      const bad = await call('PUT', `/api/quizzes/${quizId}/folder`, olena.cookie, payload);
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: 'invalid_payload' });
    }
    expect((await quizzes(petro.cookie))[0]?.folderId).toBeNull();
  });
});
