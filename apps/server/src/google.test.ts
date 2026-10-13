import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { TEST_AUTH } from './testing/accounts';
import { createTestDb } from './testing/test-db';

type Ctx = Awaited<ReturnType<typeof buildApp>>;
let plain: Ctx;
let withGoogle: Ctx;

beforeAll(async () => {
  plain = await buildApp({ db: await createTestDb(), auth: TEST_AUTH });
  withGoogle = await buildApp({
    db: await createTestDb(),
    auth: { ...TEST_AUTH, google: { clientId: 'client-123.apps.googleusercontent.com', clientSecret: 'shh' } },
  });
});

afterAll(async () => {
  await plain.app.close();
  await withGoogle.app.close();
});

const providers = (ctx: Ctx) => ctx.app.inject({ method: 'GET', url: '/api/auth-providers' });
const social = (ctx: Ctx) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/social',
    payload: { provider: 'google', callbackURL: '/quizzes' },
    headers: { origin: 'http://localhost:3000' },
  });

describe('sign-in with Google', () => {
  it('is reported as unavailable until the keys are configured', async () => {
    expect((await providers(plain)).json()).toEqual({ google: false });
    expect((await providers(withGoogle)).json()).toEqual({ google: true });
  });

  it('sends the browser to Google with our client id and return address', async () => {
    const response = await social(withGoogle);
    expect(response.statusCode).toBe(200);
    const url = new URL((response.json() as { url: string }).url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('client-123.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/google');
    expect(response.body).not.toContain('shh');
  });

  it('refuses politely when Google is not configured', async () => {
    const response = await social(plain);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });
});
