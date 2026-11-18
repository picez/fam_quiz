import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Question, type QuestionBankPage } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { boardRound, bool, classicRound, duels, makeQuiz, makeRoundsQuiz, single, text, withId } from '@quiz/engine/testing';
import { buildApp } from './app';
import { quiz } from './db/schema';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
  ctx = await buildApp({ db, auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

type Method = 'GET' | 'POST' | 'DELETE';
const call = (method: Method, url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, payload, headers: cookie === undefined ? {} : { cookie } });
const bank = async (cookie: string, query = ''): Promise<QuestionBankPage> => {
  const response = await call('GET', `/api/question-bank${query}`, cookie);
  expect(response.statusCode).toBe(200);
  return response.json() as QuestionBankPage;
};
async function save(cookie: string, data: object): Promise<string> {
  const response = await call('POST', '/api/quizzes', cookie, data);
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}
const titled = (title: string, questions: Question[]) => ({ ...makeQuiz(questions), title });
const many = (prefix: string, count: number): Question[] => Array.from({ length: count }, (_, i) => withId({ ...single, text: `Запитання ${prefix} ${i + 1}` }, `${prefix}${i + 1}`));

describe('question bank', () => {
  it('requires a session', async () => {
    const response = await call('GET', '/api/question-bank');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it("returns only the asker's quizzes", async () => {
    const olena = await signUp(ctx.app, 'Олена');
    const taras = await signUp(ctx.app, 'Тарас');
    await save(olena.cookie, titled('Річки України', [{ ...single, text: 'Яка річка найдовша в Україні?' }]));
    await save(taras.cookie, titled('Річки Європи', [{ ...single, text: 'Яка річка тече через Відень?' }]));
    const mine = await bank(olena.cookie, `?q=${encodeURIComponent('річка')}`);
    expect(mine.total).toBe(1);
    expect(mine.items.map((i) => [i.quizTitle, i.question.type === 'single' ? i.question.text : ''])).toEqual([['Річки України', 'Яка річка найдовша в Україні?']]);
    const his = await bank(taras.cookie, `?q=${encodeURIComponent('річка')}`);
    expect(his.items.map((i) => i.quizTitle)).toEqual(['Річки Європи']);
    expect((await bank(taras.cookie, `?q=${encodeURIComponent('Україні')}`)).total).toBe(0);
    const owner = (await call('GET', '/api/me', olena.cookie)).json() as { id: string };
    const sneaky = await call('GET', `/api/question-bank?ownerId=${owner.id}`, taras.cookie);
    expect(sneaky.statusCode).toBe(400);
    expect(sneaky.json()).toEqual({ error: 'invalid_payload' });
    for (const bad of ['?page=0', '?page=abc', '?types=nope', '?types=']) expect((await call('GET', `/api/question-bank${bad}`, taras.cookie)).statusCode).toBe(400);
  });

  it('returns whole questions with their source', async () => {
    const { cookie } = await signUp(ctx.app, 'Леся');
    const withImage = { ...single, text: 'Що на фото?', imageUrl: `/uploads/${'b'.repeat(32)}.png` };
    const id = await save(cookie, makeRoundsQuiz([classicRound('r1', [withImage], { title: 'Перший' }), boardRound('r2', [{ title: 'Гори', cells: [withId(bool, 'bq1'), withId(bool, 'bq2'), withId(bool, 'bq3')] }, { title: 'Ріки', cells: [withId(bool, 'bq4'), withId(bool, 'bq5'), withId(bool, 'bq6')] }, { title: 'Моря', cells: [withId(bool, 'bq7'), withId(bool, 'bq8'), withId(bool, 'bq9')] }], { title: 'Поле' })]));
    const page = await bank(cookie, '?types=single');
    expect(page.items).toHaveLength(1);
    const saved = ((await call('GET', `/api/quizzes/${id}`, cookie)).json() as { rounds: { questions: Question[] }[] }).rounds[0]!.questions[0]!;
    expect(page.items[0]).toEqual({ quizId: id, quizTitle: 'Тестова вікторина', roundIndex: 0, roundTitle: 'Перший', question: saved });
    expect(saved).toMatchObject({ imageUrl: withImage.imageUrl, options: single.options });
    const cells = await bank(cookie, '?types=boolean');
    expect(cells.total).toBe(9);
    expect(cells.items.every((i) => i.roundIndex === 1 && i.roundTitle === 'Поле')).toBe(true);
  });

  it('filters by type', async () => {
    const { cookie } = await signUp(ctx.app, 'Орест');
    await save(cookie, makeQuiz([single, bool, text]));
    expect((await bank(cookie, '?types=boolean')).items.map((i) => i.question.type)).toEqual(['boolean']);
    expect((await bank(cookie, '?types=single,text')).items.map((i) => i.question.type)).toEqual(['single', 'text']);
    expect((await call('GET', '/api/question-bank?types=nope', cookie)).statusCode).toBe(400);
  });

  it('pages by 30, newest quiz first', async () => {
    const { cookie } = await signUp(ctx.app, 'Марта');
    const oldId = await save(cookie, titled('Стара', many('o', 20)));
    const newId = await save(cookie, titled('Нова', many('n', 15)));
    await db.update(quiz).set({ updatedAt: new Date('2020-01-01T00:00:00Z') }).where(eq(quiz.id, oldId));
    await db.update(quiz).set({ updatedAt: new Date('2021-01-01T00:00:00Z') }).where(eq(quiz.id, newId));
    const first = await bank(cookie);
    expect(first).toMatchObject({ page: 1, pages: 2, total: 35 });
    expect(first.items).toHaveLength(30);
    expect(first.items.slice(0, 15).map((i) => [i.quizTitle, i.question.id])).toEqual(Array.from({ length: 15 }, (_, i) => ['Нова', `n${i + 1}`]));
    expect(first.items[15]!.quizTitle).toBe('Стара');
    expect((await bank(cookie, '?page=2')).items).toHaveLength(5);
    expect(await bank(cookie, '?page=3')).toEqual({ items: [], page: 3, pages: 2, total: 35 });
  });

  it('searches answers and hints without case or apostrophes', async () => {
    const { cookie } = await signUp(ctx.app, 'Соломія');
    await save(cookie, makeQuiz([{ ...text, text: 'Яке місто на Смотричі?', accepted: ['Кам’янець'] }, { ...single, text: 'Про що мова?', hint: 'Тече через Київ' }]));
    expect((await bank(cookie, `?q=${encodeURIComponent("кам'янець")}`)).items.map((i) => i.question.type)).toEqual(['text']);
    expect((await bank(cookie, `?q=${encodeURIComponent('КИЇВ')}`)).items.map((i) => i.question.type)).toEqual(['single']);
  });

  it('skips spares, duels and trials', async () => {
    const { cookie } = await signUp(ctx.app, 'Данило');
    const data = makeQuiz(many('s', 6));
    const withPools = {
      ...data,
      spares: [{ ...single, id: 'sp1', text: 'Запасне про Говерлу' }],
      duels: { ...duels, categories: duels.categories.map((c, i) => (i === 0 ? { ...c, questions: c.questions.map((q, k) => (k === 0 ? { ...q, text: 'Дуель про Говерлу?' } : q)) } : c)) },
    };
    await save(cookie, withPools);
    expect((await bank(cookie, `?q=${encodeURIComponent('говерла')}`)).total).toBe(0);
    expect((await bank(cookie)).total).toBe(6);
  });

  it('deleted quizzes are gone', async () => {
    const { cookie } = await signUp(ctx.app, 'Ірина');
    const id = await save(cookie, titled('Тимчасова', [{ ...single, text: 'Унікальне слово зозуля' }]));
    expect((await bank(cookie, '?q=зозуля')).total).toBe(1);
    expect((await call('DELETE', `/api/quizzes/${id}`, cookie)).statusCode).toBe(204);
    expect((await bank(cookie, '?q=зозуля')).total).toBe(0);
  });
});
