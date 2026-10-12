import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TEST_AUTH, cookieOf, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

const me = (cookie?: string) =>
  ctx.app.inject({ method: 'GET', url: '/api/me', headers: cookie === undefined ? {} : { cookie } });

const post = (url: string, payload: object, cookie?: string) =>
  ctx.app.inject({ method: 'POST', url, payload, headers: cookie === undefined ? {} : { cookie } });

describe('accounts', () => {
  it('registers a user and recognises them by the session cookie', async () => {
    const { cookie, email } = await signUp(ctx.app, 'Олена');
    expect(cookie).not.toBe('');
    const response = await me(cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Олена', email });
    expect(response.json().id).toEqual(expect.any(String));
    expect(JSON.stringify(response.json())).not.toContain('password');
  });

  it('answers 401 without a session', async () => {
    const response = await me();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('treats a forged or garbage session cookie as no session', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const forged = cookie.replace(/=(.{6})/, '=xxxxxx');
    expect((await me(forged)).statusCode).toBe(401);
    expect((await me('better-auth.session_token=garbage')).statusCode).toBe(401);
    expect((await me('a=%E0%A4%A')).statusCode).toBe(401);
  });

  it('signs in with the right password and refuses a wrong one', async () => {
    const { email, password } = await signUp(ctx.app, 'Тарас');

    const good = await post('/api/auth/sign-in/email', { email, password });
    expect(good.statusCode).toBe(200);
    expect((await me(cookieOf(good))).json()).toMatchObject({ email });

    const bad = await post('/api/auth/sign-in/email', { email, password: 'wrong password' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);
    expect(cookieOf(bad)).toBe('');
  });

  it('refuses a second account with the same email and a password that is too short', async () => {
    const { email } = await signUp(ctx.app, 'Олена');
    const duplicate = await post('/api/auth/sign-up/email', { name: 'Інша', email, password: 'correct horse battery' });
    expect(duplicate.statusCode).toBeGreaterThanOrEqual(400);
    expect(duplicate.statusCode).toBeLessThan(500);

    const short = await post('/api/auth/sign-up/email', { name: 'Ірина', email: 'short@example.com', password: '1234567' });
    expect(short.statusCode).toBeGreaterThanOrEqual(400);
    expect(short.statusCode).toBeLessThan(500);
  });

  it('ends the session on sign-out', async () => {
    const { cookie } = await signUp(ctx.app, 'Олена');
    const out = await post('/api/auth/sign-out', {}, cookie);
    expect(out.statusCode).toBe(200);
    expect((await me(cookie)).statusCode).toBe(401);
  });
});
