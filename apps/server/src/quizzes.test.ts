import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { quizSchema } from '@quiz/shared';
import { sql } from 'drizzle-orm';
import { bool, classicRound, makeQuiz, makeRoundsQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import { answer, game, user } from './db/schema';
import { createQuiz as saveQuiz, getQuiz, listQuizzes } from './quizzes';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb, createTestDbUpTo } from './testing/test-db';

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
    const invalid = makeRoundsQuiz([]);
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
  it('saves a quiz of two rounds unchanged and counts the questions of both', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const rounds = makeRoundsQuiz([
      classicRound('r1', [single, text], { title: 'Розминка' }),
      classicRound('r2', [bool], { title: 'Ризик', rules: { penalty: 'minus', partial: 50, streak: null, multiplier: 2 } }),
    ]);
    const created = await call('POST', '/api/quizzes', cookie, rounds);
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };

    expect((await call('GET', `/api/quizzes/${id}`, cookie)).json()).toEqual({ id, ...rounds });
    const list = (await call('GET', '/api/quizzes', cookie)).json() as { questionCount: number }[];
    expect(list.map((item) => item.questionCount)).toEqual([3]);
  });

  it('accepts a quiz in the old format from a page opened before the update', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const old = {
      title: 'Тестова вікторина',
      description: '',
      settings: { speedBonus: false, leaderboard: 'end', shuffleOptions: true },
      questions: [single, text],
    };
    const created = await call('POST', '/api/quizzes', cookie, old);
    expect(created.statusCode).toBe(201);
    const { id } = created.json() as { id: string };
    const expected = makeQuiz([single, text], { speedBonus: false, leaderboard: 'end', shuffleOptions: true });
    expect((await call('GET', `/api/quizzes/${id}`, cookie)).json()).toEqual({ id, ...expected });
    expect((await call('PUT', `/api/quizzes/${id}`, cookie, old)).statusCode).toBe(200);
  });
});

describe('moving saved quizzes to rounds (migration 0002)', () => {
  it('turns every saved quiz into one classic round with the same questions and settings', async () => {
    const { db, migrateRest } = await createTestDbUpTo('0001_results');
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const insertOld = async (id: string, settings: object, questions: object[]) => {
      await db.execute(sql`
        INSERT INTO "quiz" ("id", "owner_id", "title", "description", "settings", "questions")
        VALUES (${id}, 'u1', 'Тестова вікторина', '', ${JSON.stringify(settings)}::jsonb, ${JSON.stringify(questions)}::jsonb)`);
      return id;
    };
    const plain = await insertOld('55555555-5555-4555-8555-555555555555', { speedBonus: true, leaderboard: 'each', shuffleOptions: false }, [
      single,
      text,
    ]);
    const tuned = await insertOld('66666666-6666-4666-8666-666666666666', { speedBonus: false, leaderboard: 'end', shuffleOptions: true }, [
      bool,
    ]);

    // Зіграна гра й відповідь старого формату: знімок лишається як був, нові стовпці отримують типові значення.
    const snapshot = {
      title: 'Гра',
      description: '',
      settings: { speedBonus: true, leaderboard: 'each', shuffleOptions: false },
      questions: [single],
    };
    await db.execute(sql`
      INSERT INTO "game" ("id", "host_id", "code", "status", "title", "quiz_snapshot", "questions_played", "started_at")
      VALUES ('11111111-1111-4111-8111-111111111111', 'u1', '123456', 'finished', 'Гра', ${JSON.stringify(snapshot)}::jsonb, 1, now())`);
    await db.execute(sql`
      INSERT INTO "participant" ("id", "game_id", "nickname", "score", "total_time_ms")
      VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Тарас', 1000, 3000)`);
    await db.execute(sql`
      INSERT INTO "answer" ("participant_id", "question_index", "payload", "time_ms", "accepted", "points", "overridden")
      VALUES ('22222222-2222-4222-8222-222222222222', 0, '{"type":"single","optionId":"b"}'::jsonb, 3000, true, 1000, false)`);

    await migrateRest();

    expect(await getQuiz(db, 'u1', plain)).toEqual(makeQuiz([single, text]));
    expect(await getQuiz(db, 'u1', tuned)).toEqual(makeQuiz([bool], { speedBonus: false, leaderboard: 'end', shuffleOptions: true }));
    expect(quizSchema.safeParse(await getQuiz(db, 'u1', plain)).success).toBe(true);
    expect((await listQuizzes(db, 'u1')).map((item) => item.questionCount).sort()).toEqual([1, 2]);

    const [played] = await db.select().from(game);
    expect(played.quizSnapshot).toEqual(snapshot);
    expect(played.plays).toEqual([]);
    const [given] = await db.select().from(answer);
    expect(given).toMatchObject({ questionIndex: 0, roundIndex: 0, streakBonus: 0, points: 1000 });
  });
});

describe('getQuiz with an old saved board quiz', () => {
  it('fills in the cell kind and penalty that old cells lack', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const cell = { mark: 'none', question: single };
    const old = {
      title: 'Поле',
      description: '',
      settings: { leaderboard: 'each' },
      rounds: [
        {
          id: 'g1',
          type: 'board',
          title: '',
          shuffleOptions: false,
          answerMode: 'phone',
          check: 'auto',
          rules: { penalty: 'none', partial: null, streak: null, multiplier: 1 },
          categories: ['a', 'b', 'c'].map((id) => ({
            id,
            title: id,
            cells: [1, 2, 3].map((n) => ({ ...cell, question: { ...single, id: `${id}${n}` } })),
          })),
        },
      ],
    };
    const id = await saveQuiz(db, 'u1', old as never);
    const got = await getQuiz(db, 'u1', id);
    const first = got?.rounds[0].type === 'board' ? got.rounds[0].categories[0].cells[0] : null;
    expect(first).toMatchObject({ kind: 'normal', penalty: 'none' });
  });
});
