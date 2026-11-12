import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diskStorage, isMediaName, isStickerKey, memoryStorage, sniffAudio, sniffImage, sniffSticker, stripMp3Tags } from './images';
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

  it('accepts an ftyp box only with an audio-ish major brand', () => {
    for (const brand of ['M4A ', 'M4B ', 'mp42', 'mp41', 'isom', 'iso2', 'dash']) {
      expect(sniffAudio(text(`\x00\x00\x00\x20ftyp${brand}`))).toBe('audio/mp4');
    }
    for (const brand of ['heic', 'avif', 'qt  ', '3gp4', 'crx ', 'M4V ']) {
      expect(sniffAudio(text(`\x00\x00\x00\x20ftyp${brand}`))).toBeNull();
    }
    expect(sniffAudio(text('\x00\x00\x00\x20ftyp'))).toBeNull();
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

describe('stickers in the storage', () => {
  const GIF = new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0]));
  const GIF87 = new Uint8Array([...'GIF87a'].map((c) => c.charCodeAt(0)).concat([1, 0]));

  it('recognizes only the shape stickers/<id>.<gif|png>', () => {
    expect(isStickerKey('stickers/nyaBeach.png')).toBe(true);
    expect(isStickerKey('stickers/nyaBeach.gif')).toBe(true);
    for (const bad of ['stickers/../x.png', 'stickers/a.webp', 'nyaBeach.png', 'stickers/1a.gif', 'stickers/a/b.gif']) {
      expect(isStickerKey(bad)).toBe(false);
    }
  });

  it('sniffs GIF87a, GIF89a and PNG, and nothing else', () => {
    expect(sniffSticker(GIF)).toBe('image/gif');
    expect(sniffSticker(GIF87)).toBe('image/gif');
    expect(sniffSticker(PNG)).toBe('image/png');
    expect(sniffSticker(JPEG)).toBeNull();
    expect(sniffSticker(new Uint8Array())).toBeNull();
  });

  it('keeps GIF out of the question-image sniffer', () => {
    expect(sniffImage(GIF)).toBeNull();
  });

  it('stores and returns a sticker in memory', async () => {
    const storage = memoryStorage();
    await storage.put('stickers/x.gif', GIF, 'image/gif');
    expect((await storage.get('stickers/x.gif'))?.bytes).toEqual(GIF);
    await expect(storage.put('stickers/../x.gif', GIF, 'image/gif')).rejects.toThrow();
  });

  it('stores and returns a sticker on disk, creating the folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stickers-'));
    try {
      const storage = diskStorage(dir);
      await storage.put('stickers/x.gif', GIF, 'image/gif');
      expect(Buffer.from((await storage.get('stickers/x.gif'))!.bytes)).toEqual(Buffer.from(GIF));
      expect(await storage.get('stickers/y.gif')).toBeNull();
      expect(await storage.get('stickers/../x.gif')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('stripMp3Tags', () => {
  const frame = () => [0xff, 0xfb, 0x90, 0x64, ...new Array<number>(413).fill(0)];
  const frames = (n = 3) => Array.from({ length: n }, frame).flat();
  const ascii = (value: string) => [...value].map((c) => c.charCodeAt(0));
  const id3v2 = (title: string, flags = 0) => {
    const body = [...ascii('TIT2'), 0, 0, 0, title.length + 1, 0, 0, 0, ...ascii(title)];
    const size = body.length;
    const footer = flags & 0x10 ? [...ascii('3DI'), 4, 0, flags, 0, 0, 0, 0] : [];
    return [...ascii('ID3'), 4, 0, flags, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f, ...body, ...footer];
  };
  const id3v1 = (title: string) => [...ascii('TAG'), ...ascii(title), ...new Array<number>(125 - title.length).fill(0)];
  const text = (bytes: ArrayLike<number>) => String.fromCharCode(...Array.from(bytes));

  it('stripMp3Tags drops ID3v2 and ID3v1', () => {
    const audio = frames();
    const stripped = stripMp3Tags(Uint8Array.from([...id3v2('Shchedryk'), ...audio, ...id3v1('Shchedryk')]));
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xfb);
    expect(text(stripped)).not.toContain('Shchedryk');
    expect(stripped.length).toBe(audio.length);
    expect(sniffAudio(stripped)).toBe('audio/mpeg');
  });

  it('drops two ID3v2 tags in a row and a footer', () => {
    const audio = frames();
    expect(stripMp3Tags(Uint8Array.from([...id3v2('Carol'), ...id3v2('Bells'), ...audio])).length).toBe(audio.length);
    expect(stripMp3Tags(Uint8Array.from([...id3v2('Carol', 0x10), ...audio])).length).toBe(audio.length);
  });

  it('returns an MP3 without tags as it is', () => {
    const audio = Uint8Array.from(frames());
    expect(stripMp3Tags(audio)).toBe(audio);
  });

  it('finds the frame sync after zeros or junk behind the tag', () => {
    const audio = frames();
    const stripped = stripMp3Tags(Uint8Array.from([...id3v2('Shchedryk'), ...new Array<number>(16).fill(0), ...audio]));
    expect(stripped.length).toBe(audio.length);
    expect(text(stripped)).not.toContain('Shchedryk');
  });

  it('keeps the original when no frame follows the tags or the tag size is too big', () => {
    const header = Uint8Array.from(id3v2('Shchedryk'));
    expect(stripMp3Tags(header)).toBe(header);
    const big = Uint8Array.from([...ascii('ID3'), 3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f, ...frames(2)]);
    expect(() => stripMp3Tags(big)).not.toThrow();
    expect(sniffAudio(stripMp3Tags(big))).toBe('audio/mpeg');
    const junk = Uint8Array.from([...id3v2('Carol'), ...ascii('ID3abc')]);
    expect(stripMp3Tags(junk)).toBe(junk);
  });

  it('skips a UTF-16 BOM (FF FE, FF FF) when looking for the frame sync', () => {
    const audio = frames();
    for (const bom of [[0xff, 0xfe], [0xff, 0xff]]) {
      const stripped = stripMp3Tags(Uint8Array.from([...id3v2('Shchedryk'), ...bom, 0x53, 0x00, ...audio]));
      expect(stripped.length).toBe(audio.length);
      expect(stripped[1]).toBe(0xfb);
    }
  });

  it('drops ID3v1 without ID3v2', () => {
    const audio = frames();
    const stripped = stripMp3Tags(Uint8Array.from([...audio, ...id3v1('Shchedryk')]));
    expect(stripped.length).toBe(audio.length);
    expect(text(stripped)).not.toContain('Shchedryk');
  });
});
