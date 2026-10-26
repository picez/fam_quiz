import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeQuiz, single, text } from '@quiz/engine/testing';
import { buildApp } from './app';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

// Блокувань у наявних форматах немає (AUTOPILOT_BLOCKS порожній): перевірка підміняє їх для вікторини з цією назвою.
const BLOCKED_TITLE = 'Заблокована вікторина';
vi.mock('@quiz/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof import('@quiz/shared')>();
  return {
    ...shared,
    autopilotCheck: (quiz: import('@quiz/shared').Quiz) => {
      const check = shared.autopilotCheck(quiz);
      return quiz.title === BLOCKED_TITLE ? { ...check, blocked: [{ code: 'future', rounds: [0] }] } : check;
    },
  };
});

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const call = (url: string, cookie: string, payload: object) => ctx.app.inject({ method: 'POST', url, payload, headers: { cookie } });

describe('an autopilot room from a blocked quiz (11g)', () => {
  it('is refused with 409 autopilot_blocked and creates nothing; a hosted game from it still starts', async () => {
    const account = await signUp(ctx.app, 'Олена');
    const saved = await call('/api/quizzes', account.cookie, { ...makeQuiz([single, text]), title: BLOCKED_TITLE });
    expect(saved.statusCode).toBe(201);
    const { id: quizId } = saved.json() as { id: string };
    const before = ctx.manager.size;
    const refused = await call('/api/games', account.cookie, { quizId, autopilot: true, nickname: 'Марта' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'autopilot_blocked' });
    expect(ctx.manager.size).toBe(before);
    expect((await call('/api/games', account.cookie, { quizId })).statusCode).toBe(201);
  });

  it('a quiz with no blocks still makes an autopilot room', async () => {
    const account = await signUp(ctx.app, 'Тарас');
    const saved = await call('/api/quizzes', account.cookie, makeQuiz([single, text]));
    const { id: quizId } = saved.json() as { id: string };
    expect((await call('/api/games', account.cookie, { quizId, autopilot: true, nickname: 'Тарас' })).statusCode).toBe(201);
  });
});
