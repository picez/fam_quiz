import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diskStorage, isMediaName, memoryStorage, sniffAudio, sniffImage } from './images';
import { r2Storage } from './r2';
import { JPEG, PNG, WEBP } from '../testing/images';

describe('sniffImage', () => {
  it('recognises the three allowed formats by their content', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(WEBP)).toBe('image/webp');
  });

  it('rejects everything else, whatever it claims to be', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(sniffImage(text('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toBeNull();
    expect(sniffImage(text('GIF89a........'))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(text('RIFF....WAVEfmt '))).toBeNull();
  });
});

describe('sniffAudio', () => {
  const text = (value: string) => new TextEncoder().encode(value);

  it('recognises mp3, ogg and m4a by their content', () => {
    expect(sniffAudio(text('ID3\x04\x00\x00\x00\x00\x00\x00'))).toBe('audio/mpeg');
    expect(sniffAudio(new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00]))).toBe('audio/mpeg');
    expect(sniffAudio(text('OggS\x00\x02'))).toBe('audio/ogg');
    expect(sniffAudio(text('\x00\x00\x00\x20ftypM4A '))).toBe('audio/mp4');
  });

  it('rejects everything else, whatever it claims to be', () => {
    expect(sniffAudio(PNG)).toBeNull();
    expect(sniffAudio(text('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffAudio(new Uint8Array())).toBeNull();
    expect(sniffAudio(new Uint8Array([0xff]))).toBeNull();
    // Кадр без бітів синхронізації не є MPEG-аудіо.
    expect(sniffAudio(new Uint8Array([0xff, 0x10, 0x00, 0x00]))).toBeNull();
  });
});

describe('isMediaName', () => {
  it('accepts image and audio names and nothing that can leave the store', async () => {
    for (const extension of ['mp3', 'ogg', 'm4a', 'png']) expect(isMediaName(`${'a'.repeat(32)}.${extension}`)).toBe(true);
    expect(isMediaName('../x.mp3')).toBe(false);
    expect(isMediaName(`${'a'.repeat(32)}.svg`)).toBe(false);
    await expect(memoryStorage().put(`${'a'.repeat(32)}.ogg`, new Uint8Array([1]), 'audio/ogg')).resolves.toBeUndefined();
  });
});

describe.each([
  ['memory', async () => ({ storage: memoryStorage(), dir: null as string | null })],
  [
    'disk',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'quiz-images-'));
      return { storage: diskStorage(join(dir, 'nested')), dir };
    },
  ],
])('%s storage', (_name, make) => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it('returns what was stored and null for an unknown name', async () => {
    const { storage, dir } = await make();
    if (dir !== null) dirs.push(dir);
    await storage.put('0123456789abcdef.png', PNG, 'image/png');
    const found = await storage.get('0123456789abcdef.png');
    expect(found).not.toBeNull();
    expect([...found!.bytes]).toEqual([...PNG]);
    expect(await storage.get('fedcba9876543210.png')).toBeNull();
  });

  it('refuses names that could leave the storage', async () => {
    const { storage, dir } = await make();
    if (dir !== null) dirs.push(dir);
    for (const name of ['../escape.png', 'a/b.png', '..\\escape.png', '', 'no-extension']) {
      await expect(storage.put(name, PNG, 'image/png'), name).rejects.toThrow();
      expect(await storage.get(name), name).toBeNull();
    }
    if (dir !== null) expect(await readdir(dir)).not.toContain('escape.png');
  });
});

describe('r2 storage', () => {
  const settings = { accountId: 'acc123', bucket: 'quiz-images', accessKeyId: 'key', secretAccessKey: 'secret' };

  it('uploads with a signed request to the bucket', async () => {
    const seen: Request[] = [];
    const storage = r2Storage({
      ...settings,
      fetch: async (request) => {
        seen.push(request);
        return new Response(null, { status: 200 });
      },
    });
    await storage.put('0123456789abcdef.png', PNG, 'image/png');
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('PUT');
    expect(seen[0].url).toBe('https://acc123.r2.cloudflarestorage.com/quiz-images/0123456789abcdef.png');
    expect(seen[0].headers.get('content-type')).toBe('image/png');
    expect(seen[0].headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=key\//);
    expect([...new Uint8Array(await seen[0].arrayBuffer())]).toEqual([...PNG]);
  });

  it('reads an image, answers null for a missing one and fails loudly otherwise', async () => {
    let status = 200;
    const storage = r2Storage({
      ...settings,
      fetch: async () => new Response(status === 200 ? PNG : 'nope', { status }),
    });
    expect([...(await storage.get('0123456789abcdef.png'))!.bytes]).toEqual([...PNG]);
    status = 404;
    expect(await storage.get('0123456789abcdef.png')).toBeNull();
    status = 500;
    await expect(storage.get('0123456789abcdef.png')).rejects.toThrow();
    await expect(storage.put('0123456789abcdef.png', PNG, 'image/png')).rejects.toThrow();
  });

  it('refuses names that could address another object', async () => {
    const storage = r2Storage({ ...settings, fetch: async () => new Response(null, { status: 200 }) });
    await expect(storage.put('../other-bucket/x.png', PNG, 'image/png')).rejects.toThrow();
    expect(await storage.get('a/b.png')).toBeNull();
  });
});
