import type { Quiz } from '@quiz/shared';
import type { FastifyInstance } from 'fastify';
import type { AuthOptions } from '../auth';

export const TEST_AUTH: AuthOptions = {
  secret: 'test-secret-that-is-long-enough-for-signing-sessions',
  baseURL: 'http://localhost:3000',
  // Тести реєструють багато користувачів з однієї адреси.
  attemptsPerMinute: 10_000,
};

/** Заголовок Cookie з відповіді, що встановила сесію. */
export function cookieOf(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [String(raw)];
  return list.map((cookie) => String(cookie).split(';')[0]).join('; ');
}

let counter = 0;

/** Реєструє нового користувача й повертає його cookie сесії. */
export async function signUp(app: FastifyInstance, name: string) {
  counter += 1;
  const email = `user${counter}-${Date.now()}@example.com`;
  const password = 'correct horse battery';
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name, email, password },
  });
  if (response.statusCode !== 200) throw new Error(`sign-up failed: ${response.statusCode} ${response.body}`);
  return { cookie: cookieOf(response), email, password };
}

export interface StartedGame {
  gameId: string;
  code: string;
  hostToken: string;
  stageToken: string;
}

/** Зберігає вікторину від імені ведучого (нового, якщо cookie не передано) і запускає з неї гру. */
export async function startGame(app: FastifyInstance, quiz: Quiz, cookie?: string) {
  const session = cookie ?? (await signUp(app, 'Ведучий')).cookie;
  const saved = await app.inject({ method: 'POST', url: '/api/quizzes', payload: quiz, headers: { cookie: session } });
  if (saved.statusCode !== 201) throw new Error(`quiz was not saved: ${saved.statusCode} ${saved.body}`);
  const { id: quizId } = saved.json() as { id: string };
  const response = await app.inject({ method: 'POST', url: '/api/games', payload: { quizId }, headers: { cookie: session } });
  return { response, cookie: session, quizId, game: response.json() as StartedGame };
}
