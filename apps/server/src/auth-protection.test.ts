import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: { ...TEST_AUTH, attemptsPerMinute: 3 }, trustProxy: true });
});

afterAll(async () => {
  await ctx.app.close();
});

const signIn = (address: string, email: string, password: string) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { 'x-forwarded-for': address },
    payload: { email, password },
  });

describe('sign-in throttling', () => {
  it('limits attempts per client address without locking out anyone else', async () => {
    const { email, password } = await signUp(ctx.app, 'Олена');

    const attempts = [];
    for (let i = 0; i < 4; i++) attempts.push((await signIn('10.0.0.1', email, 'wrong password')).statusCode);
    expect(attempts).toEqual([401, 401, 401, 429]);

    expect((await signIn('10.0.0.1', email, password)).statusCode).toBe(429);
    // Тіло відповіді входить у порівняння: якщо тест колись упаде, буде видно, що саме відповів сервер.
    const other = await signIn('10.0.0.2', email, password);
    expect({ status: other.statusCode, body: other.statusCode === 200 ? 'signed in' : other.body }).toEqual({
      status: 200,
      body: 'signed in',
    });
  });

  it('limits registrations per client address', async () => {
    const register = (n: number) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: { 'x-forwarded-for': '10.0.0.7' },
        payload: { name: 'Бот', email: `bot${n}-${Date.now()}@example.com`, password: 'correct horse battery' },
      });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await register(i)).statusCode);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('malformed Host header', () => {
  it('never turns an auth request into a server error', async () => {
    for (const host of ['[', 'a b', 'localhost:3000@evil.example']) {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { host, 'x-forwarded-for': '10.0.0.3' },
      });
      expect(response.statusCode).toBeLessThan(500);
    }
  });
});
