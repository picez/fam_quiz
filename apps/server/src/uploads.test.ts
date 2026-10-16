import { IMAGE_LIMITS, IMAGE_URL } from '@quiz/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { memoryStorage, type ImageStorage } from './storage/images';
import { TEST_AUTH, signUp } from './testing/accounts';
import { JPEG, PNG, WEBP } from './testing/images';
import { createTestDb } from './testing/test-db';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let cookie: string;
/** Сховище, яке можна «вимкнути», щоб перевірити поведінку під час збою. */
let broken = false;
const inner = memoryStorage();
const storage: ImageStorage = {
  put: (...args) => (broken ? Promise.reject(new Error('storage down')) : inner.put(...args)),
  get: (name) => (broken ? Promise.reject(new Error('storage down')) : inner.get(name)),
};

beforeAll(async () => {
  ctx = await buildApp({ db: await createTestDb(), auth: TEST_AUTH, storage });
  cookie = (await signUp(ctx.app, 'Олена')).cookie;
});

afterAll(async () => {
  await ctx.app.close();
});

const upload = (body: Uint8Array | string, type: string, session: string | null = cookie) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/uploads',
    payload: typeof body === 'string' ? body : Buffer.from(body),
    headers: { 'content-type': type, ...(session === null ? {} : { cookie: session }) },
  });

describe('uploading an image', () => {
  it.each([
    ['image/jpeg', JPEG, 'jpg'],
    ['image/png', PNG, 'png'],
    ['image/webp', WEBP, 'webp'],
  ])('stores %s and returns its address', async (type, bytes, extension) => {
    const response = await upload(bytes, type);
    expect(response.statusCode).toBe(201);
    const { url } = response.json() as { url: string };
    expect(url).toMatch(IMAGE_URL);
    expect(url.endsWith(`.${extension}`)).toBe(true);

    const served = await ctx.app.inject({ method: 'GET', url });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe(type);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toContain('immutable');
    expect([...served.rawPayload]).toEqual([...bytes]);
  });

  it('names the file by its content, not by what the client claims', async () => {
    const response = await upload(PNG, 'image/jpeg');
    expect(response.statusCode).toBe(201);
    expect((response.json() as { url: string }).url.endsWith('.png')).toBe(true);
  });

  it('requires a session', async () => {
    const response = await upload(PNG, 'image/png', null);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects content that is not an allowed image', async () => {
    for (const [body, type] of [
      ['<html><script>alert(1)</script></html>', 'image/png'],
      ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'image/webp'],
      ['GIF89a', 'image/jpeg'],
    ] as const) {
      const response = await upload(body, type);
      expect(response.statusCode, body).toBe(400);
      expect(response.json()).toEqual({ error: 'bad_image' });
    }
  });

  it('rejects other content types', async () => {
    for (const type of ['image/svg+xml', 'image/gif', 'text/html', 'application/octet-stream']) {
      const response = await upload(PNG, type);
      expect(response.statusCode, type).toBe(400);
      expect(response.json()).toEqual({ error: 'bad_image' });
    }
  });

  it('rejects an image above the size limit', async () => {
    const big = new Uint8Array(IMAGE_LIMITS.maxBytes + 1);
    big.set(PNG);
    const response = await upload(big, 'image/png');
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'too_large' });
  });

  it('accepts an image exactly at the size limit', async () => {
    const full = new Uint8Array(IMAGE_LIMITS.maxBytes);
    full.set(PNG);
    expect((await upload(full, 'image/png')).statusCode).toBe(201);
  });

  it('answers with an error, not a crash, when the storage is down', async () => {
    broken = true;
    try {
      const response = await upload(PNG, 'image/png');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'storage_unavailable' });
    } finally {
      broken = false;
    }
  });
});

describe('serving an image', () => {
  const get = (url: string) => ctx.app.inject({ method: 'GET', url });

  it('answers 404 for an unknown image and for names outside the storage', async () => {
    for (const url of [
      '/uploads/0123456789abcdef0123456789abcdef.png',
      '/uploads/..%2F..%2F.env',
      '/uploads/%2e%2e%2fpackage.json',
      '/uploads/index.html',
      '/uploads/x.svg',
    ]) {
      const response = await get(url);
      expect(response.statusCode, url).toBe(404);
      expect(response.headers['content-type'], url).toContain('application/json');
    }
  });

  it('does not serve stored bytes that are not an image as anything a browser would run', async () => {
    // Навіть якщо у сховище потрапило щось стороннє, сторінкою воно не стане.
    await inner.put('aaaaaaaaaaaaaaaa.png', new TextEncoder().encode('<script>alert(1)</script>'), 'image/png');
    const response = await get('/uploads/aaaaaaaaaaaaaaaa.png');
    expect(response.statusCode).toBe(404);
  });

  it('answers 503 while the storage is down', async () => {
    const { url } = (await upload(PNG, 'image/png')).json() as { url: string };
    broken = true;
    try {
      expect((await get(url)).statusCode).toBe(503);
    } finally {
      broken = false;
    }
  });

  it('needs no session: players have no account', async () => {
    const { url } = (await upload(JPEG, 'image/jpeg')).json() as { url: string };
    expect((await get(url)).statusCode).toBe(200);
  });
});

describe('a quiz with an image', () => {
  it('is saved with an uploaded address and refused with a foreign one', async () => {
    const { url } = (await upload(PNG, 'image/png')).json() as { url: string };
    const quiz = (imageUrl: string) => ({
      title: 'З картинкою',
      description: '',
      settings: { leaderboard: 'each' },
      rounds: [
        {
          id: 'r1',
          type: 'classic',
          title: '',
          speedBonus: true,
          shuffleOptions: false,
          rules: { penalty: 'none', partial: null, streak: null, multiplier: 1 },
          questions: [{ id: 'q1', type: 'boolean', text: 'Це кіт?', imageUrl, timeLimit: 20, points: 1000, correct: true }],
        },
      ],
    });
    const save = (imageUrl: string) =>
      ctx.app.inject({ method: 'POST', url: '/api/quizzes', payload: quiz(imageUrl), headers: { cookie } });
    expect((await save(url)).statusCode).toBe(201);
    expect((await save('https://evil.example/track.png')).statusCode).toBe(400);
  });
});

describe('upload limits behind a proxy', () => {
  it('counts uploads per account, so changing the address does not lift the limit', async () => {
    const proxied = await buildApp({ db: await createTestDb(), auth: TEST_AUTH, trustProxy: true });
    const session = (await signUp(proxied.app, 'Олена')).cookie;
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      const response = await proxied.app.inject({
        method: 'POST',
        url: '/api/uploads',
        payload: Buffer.from(PNG),
        headers: { 'content-type': 'image/png', cookie: session, 'x-forwarded-for': `10.1.0.${i}` },
      });
      statuses.push(response.statusCode);
    }
    await proxied.app.close();
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});
