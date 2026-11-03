import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;

const call = (method: 'GET' | 'PUT', url: string, cookie?: string, payload?: unknown) =>
  ctx.app.inject({ method, url, payload: payload as object, headers: cookie === undefined ? {} : { cookie } });

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
});

afterAll(async () => {
  await ctx.app.close();
});

describe('profile language', () => {
  it('starts as null, saves a valid locale and reports it from /api/me', async () => {
    const olena = await signUp(ctx.app, 'Олена');
    expect((await call('GET', '/api/me', olena.cookie)).json().locale).toBeNull();
    const saved = await call('PUT', '/api/me/locale', olena.cookie, { locale: 'de' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ locale: 'de' });
    expect((await call('GET', '/api/me', olena.cookie)).json().locale).toBe('de');
  });

  it('refuses anything outside the seven locales', async () => {
    const taras = await signUp(ctx.app, 'Тарас');
    for (const body of [{ locale: 'ru' }, { locale: 'fr' }, { locale: 'UK' }, { locale: 'de', x: 1 }]) {
      const response = await call('PUT', '/api/me/locale', taras.cookie, body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_payload' });
    }
  });

  it('needs a session', async () => {
    const response = await call('PUT', '/api/me/locale', undefined, { locale: 'de' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('allows 30 changes a minute per person', async () => {
    const vira = await signUp(ctx.app, 'Віра');
    for (let i = 0; i < 30; i += 1) expect((await call('PUT', '/api/me/locale', vira.cookie, { locale: 'pl' })).statusCode).toBe(200);
    expect((await call('PUT', '/api/me/locale', vira.cookie, { locale: 'pl' })).statusCode).toBe(429);
  });
});
