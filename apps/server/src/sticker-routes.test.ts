import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STICKERS } from '@quiz/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { memoryStorage, type ImageStorage } from './storage/images';
import { TEST_AUTH } from './testing/accounts';
import { PNG } from './testing/images';
import { createTestDb } from './testing/test-db';

const GIF = new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0, 0, 0, 0]));
const gifSticker = STICKERS.find((s) => s.ext === 'gif')!;
const pngSticker = STICKERS.find((s) => s.ext === 'png');
const fixture = (ext: string) => readFileSync(resolve(import.meta.dirname, '../fixtures/stickers', `sample.${ext}`));

let broken = false;
let reads = 0;
const inner = memoryStorage();
const storage: ImageStorage = {
  put: (...args) => inner.put(...args),
  get: (name) => {
    reads += 1;
    return broken ? Promise.reject(new Error('storage down')) : inner.get(name);
  },
};

let plain: Awaited<ReturnType<typeof buildApp>>;
let withFixtures: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  plain = await buildApp({ db: await createTestDb(), auth: TEST_AUTH, storage });
  withFixtures = await buildApp({ db: await createTestDb(), auth: TEST_AUTH, storage, stickerFixtures: true });
});
afterAll(async () => {
  await plain.app.close();
  await withFixtures.app.close();
});

const get = (ctx: typeof plain, url: string) => ctx.app.inject({ method: 'GET', url });

describe('serving stickers', () => {
  it('serves a stored sticker with long caching and reads the storage once', async () => {
    await inner.put(`stickers/${gifSticker.id}.gif`, GIF, 'image/gif');
    const before = reads;
    const first = await get(plain, `/stickers/${gifSticker.id}.gif`);
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/gif');
    expect(first.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(first.headers['x-content-type-options']).toBe('nosniff');
    expect(new Uint8Array(first.rawPayload)).toEqual(GIF);
    const mid = reads;
    expect(mid).toBe(before + 1);
    const second = await get(plain, `/stickers/${gifSticker.id}.gif`);
    expect(second.statusCode).toBe(200);
    expect(reads).toBe(mid);
  });

  it('answers 404 without asking the storage for ids and names outside the manifest', async () => {
    const before = reads;
    const other = gifSticker.ext === 'gif' ? 'png' : 'gif';
    for (const url of [
      `/stickers/${gifSticker.id}.${other}`,
      '/stickers/Unknown.gif',
      '/stickers/..%2Fsecret.gif',
      `/stickers/${gifSticker.id}`,
    ]) {
      const response = await get(plain, url);
      expect(response.statusCode, url).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found' });
    }
    expect(reads).toBe(before);
  });

  it('answers 404 for a known id without a file, unless fixtures are on', async () => {
    const id = STICKERS.filter((s) => s.ext === 'gif')[1]!.id;
    expect((await get(plain, `/stickers/${id}.gif`)).statusCode).toBe(404);
    const sample = await get(withFixtures, `/stickers/${id}.gif`);
    expect(sample.statusCode).toBe(200);
    expect(sample.headers['content-type']).toBe('image/gif');
    expect(sample.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(sample.rawPayload)).toEqual(fixture('gif'));
  });

  it('falls back to the png sample for a png sticker', async () => {
    if (pngSticker === undefined) return;
    const sample = await get(withFixtures, `/stickers/${pngSticker.id}.png`);
    expect(sample.headers['content-type']).toBe('image/png');
    expect(Buffer.from(sample.rawPayload)).toEqual(fixture('png'));
  });

  it('does not serve a stored file whose bytes do not match the extension', async () => {
    const id = STICKERS.filter((s) => s.ext === 'gif')[2]!.id;
    await inner.put(`stickers/${id}.gif`, PNG, 'image/gif');
    expect((await get(plain, `/stickers/${id}.gif`)).statusCode).toBe(404);
  });

  it('answers 503 while the storage is down', async () => {
    const id = STICKERS.filter((s) => s.ext === 'gif')[3]!.id;
    broken = true;
    try {
      const response = await get(plain, `/stickers/${id}.gif`);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'storage_unavailable' });
    } finally {
      broken = false;
    }
  });
});
