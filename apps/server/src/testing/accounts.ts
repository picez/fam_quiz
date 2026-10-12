import type { FastifyInstance } from 'fastify';
import type { AuthOptions } from '../auth';

export const TEST_AUTH: AuthOptions = {
  secret: 'test-secret-that-is-long-enough-for-signing-sessions',
  baseURL: 'http://localhost:3000',
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
