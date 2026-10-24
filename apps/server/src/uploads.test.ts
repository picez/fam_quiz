import { AUDIO_LIMITS, AUDIO_URL, IMAGE_LIMITS, IMAGE_URL } from '@quiz/shared';
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
let reads = 0;
const inner = memoryStorage();
const storage: ImageStorage = {
  put: (...args) => (broken ? Promise.reject(new Error('storage down')) : inner.put(...args)),
  get: (name) => {
    reads += 1;
    return broken ? Promise.reject(new Error('storage down')) : inner.get(name);
  },
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

/** Секунда тиші MP3: кадри MPEG-1 Layer III 128 кбіт/с 44,1 кГц із нульовими даними. */
const silentMp3 = (frames = 38) =>
  Buffer.concat(Array.from({ length: frames }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)])));
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40)]);
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(40)]);

const uploadAudio = (body: Uint8Array, type: string, session: string | null = cookie) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/uploads/audio',
    payload: Buffer.from(body),
    headers: { 'content-type': type, ...(session === null ? {} : { cookie: session }) },
  });

describe('uploading audio', () => {
  it('stores an mp3 named by its content', async () => {
    const response = await uploadAudio(silentMp3(), 'audio/mpeg');
    expect(response.statusCode).toBe(201);
    const { url } = response.json() as { url: string };
    expect(url).toMatch(AUDIO_URL);
    expect(url.endsWith('.mp3')).toBe(true);
  });

  it('stores ogg and m4a', async () => {
    const ogg = await uploadAudio(OGG, 'audio/ogg');
    expect(ogg.statusCode).toBe(201);
    expect((ogg.json() as { url: string }).url).toMatch(/\.ogg$/);
    const m4a = await uploadAudio(M4A, 'audio/x-m4a');
    expect(m4a.statusCode).toBe(201);
    expect((m4a.json() as { url: string }).url).toMatch(/\.m4a$/);
  });

  it('names the file by its content, not by what the client claims', async () => {
    const response = await uploadAudio(OGG, 'audio/mpeg');
    expect(response.statusCode).toBe(201);
    expect((response.json() as { url: string }).url.endsWith('.ogg')).toBe(true);
  });

  it('requires a session', async () => {
    const response = await uploadAudio(silentMp3(), 'audio/mpeg', null);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects content that is not audio', async () => {
    for (const body of [PNG, Buffer.from('<html><script>alert(1)</script></html>'), Buffer.alloc(0)]) {
      const response = await uploadAudio(body, 'audio/mpeg');
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'bad_audio' });
    }
  });

  it('rejects other content types', async () => {
    for (const type of ['image/png', 'text/html', 'application/octet-stream']) {
      const response = await uploadAudio(silentMp3(), type);
      expect(response.statusCode, type).toBe(400);
      expect(response.json()).toEqual({ error: 'bad_audio' });
    }
  });

  it('rejects audio above 5 MB and accepts exactly 5 MB', async () => {
    const big = Buffer.alloc(AUDIO_LIMITS.maxBytes + 1);
    big.set(silentMp3(1));
    const response = await uploadAudio(big, 'audio/mpeg');
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'audio_too_large' });
    expect((await uploadAudio(big.subarray(0, AUDIO_LIMITS.maxBytes), 'audio/mpeg')).statusCode).toBe(201);
  });

  it('the image route still refuses audio', async () => {
    const response = await upload(silentMp3(), 'audio/mpeg');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'bad_image' });
  });

  it('the audio route refuses an image sent as image', async () => {
    const response = await uploadAudio(PNG, 'image/png');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'bad_audio' });
  });
});

describe('serving audio', () => {
  const get = (url: string, range?: string) =>
    ctx.app.inject({ method: 'GET', url, headers: range === undefined ? {} : { range } });
  const stored = async () => {
    const bytes = silentMp3();
    const { url } = (await uploadAudio(bytes, 'audio/mpeg')).json() as { url: string };
    return { url, bytes };
  };

  it('serves audio with its type and byte ranges', async () => {
    const { url, bytes } = await stored();
    const whole = await get(url);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers['content-type']).toBe('audio/mpeg');
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.headers['x-content-type-options']).toBe('nosniff');
    expect(whole.rawPayload.length).toBe(bytes.length);

    const head = await get(url, 'bytes=0-9');
    expect(head.statusCode).toBe(206);
    expect(head.headers['content-range']).toBe(`bytes 0-9/${bytes.length}`);
    expect(head.rawPayload.length).toBe(10);

    const rest = await get(url, 'bytes=10-');
    expect(rest.statusCode).toBe(206);
    expect(rest.headers['content-range']).toBe(`bytes 10-${bytes.length - 1}/${bytes.length}`);
    expect(rest.rawPayload.length).toBe(bytes.length - 10);

    const clamped = await get(url, `bytes=5-${bytes.length * 10}`);
    expect(clamped.statusCode).toBe(206);
    expect(clamped.headers['content-range']).toBe(`bytes 5-${bytes.length - 1}/${bytes.length}`);

    const tail = await get(url, 'bytes=-4');
    expect(tail.statusCode).toBe(206);
    expect([...tail.rawPayload]).toEqual([...bytes.subarray(bytes.length - 4)]);
  });

  it('answers 416 for a valid range outside the file', async () => {
    const { url, bytes } = await stored();
    for (const range of ['bytes=999999-', `bytes=${bytes.length}-`, 'bytes=-0']) {
      const response = await get(url, range);
      expect(response.statusCode, range).toBe(416);
      expect(response.headers['content-range'], range).toBe(`bytes */${bytes.length}`);
    }
  });

  it('ignores a range it cannot parse and sends the whole file', async () => {
    const { url, bytes } = await stored();
    for (const range of ['bytes=9-3', 'bytes=-', 'bytes=0-1,5-6', 'bytes=a-b', 'items=0-1', `bytes=${'9'.repeat(30)}-`]) {
      const response = await get(url, range);
      expect(response.statusCode, range).toBe(200);
      expect(response.rawPayload.length, range).toBe(bytes.length);
    }
  });

  it('fetches a file from the storage once for several range requests', async () => {
    const { url } = await stored();
    const before = reads;
    await get(url, 'bytes=0-9');
    await get(url, 'bytes=10-19');
    await get(url);
    expect(reads - before).toBeLessThanOrEqual(1);
  });

  it('answers 404 for audio names that are not in the store or leave it', async () => {
    for (const url of ['/uploads/0123456789abcdef0123456789abcdef.mp3', '/uploads/..%2Fx.mp3', '/uploads/x.wav']) {
      expect((await get(url)).statusCode, url).toBe(404);
    }
  });

  it('does not serve stored bytes that are not audio', async () => {
    await inner.put('bbbbbbbbbbbbbbbb.mp3', new TextEncoder().encode('<script>alert(1)</script>'), 'audio/mpeg');
    expect((await get('/uploads/bbbbbbbbbbbbbbbb.mp3')).statusCode).toBe(404);
  });

  it('an image still serves as before', async () => {
    const { url } = (await upload(PNG, 'image/png')).json() as { url: string };
    const response = await get(url);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect([...response.rawPayload]).toEqual([...PNG]);
  });
});
