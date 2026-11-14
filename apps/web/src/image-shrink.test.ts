import { describe, expect, it, vi } from 'vitest';
import { RAW_IMAGE_MAX_BYTES, shrinkImage, targetSize, type ShrinkDeps } from './image-shrink';

const MB = 1024 * 1024;
const KB = 1024;

const fileOf = (size: number, type: string, name = 'photo.jpg') => new File([new Uint8Array(size)], name, { type });
const blobOf = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

function fakeDeps(options: {
  size?: { width: number; height: number } | null;
  encode?: (type: string, quality: number) => Blob | null;
  alpha?: boolean;
}): ShrinkDeps & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  return {
    close,
    decode: vi.fn(async () => (options.size === null ? null : { ...(options.size ?? { width: 4000, height: 3000 }), close })),
    encode: vi.fn(async (_bitmap: unknown, _w: number, _h: number, type: string, quality: number) => (options.encode ?? ((t) => blobOf(300 * KB, t)))(type, quality)),
    hasAlpha: vi.fn(() => options.alpha ?? false),
  };
}

describe('targetSize', () => {
  it('keeps the proportions within the longest side', () => {
    expect(targetSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(1200, 4000, 1600)).toEqual({ width: 480, height: 1600 });
    expect(targetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(10000, 3, 512)).toEqual({ width: 512, height: 1 });
  });
});

describe('shrinkImage', () => {
  it('leaves a small picture as it is', async () => {
    const file = fileOf(250 * KB, 'image/jpeg');
    const deps = fakeDeps({ size: { width: 800, height: 600 } });
    const result = await shrinkImage(file, 1600, deps);
    expect(result).toEqual({ ok: true, file });
    if (result.ok) expect(result.file).toBe(file);
    expect(deps.encode).not.toHaveBeenCalled();
    expect(deps.close).toHaveBeenCalled();
  });

  it('shrinks a phone photo to 1600 px WebP', async () => {
    const deps = fakeDeps({});
    const result = await shrinkImage(fileOf(4 * MB, 'image/jpeg', 'IMG_0001.JPG'), 1600, deps);
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 1600, 1200, 'image/webp', 0.82);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.type).toBe('image/webp');
    expect(result.file.name).toBe('IMG_0001.webp');
    expect(result.file.size).toBe(300 * KB);
    expect(deps.close).toHaveBeenCalled();
  });

  it('falls back to JPEG where the browser cannot write WebP', async () => {
    const deps = fakeDeps({ encode: (type) => (type === 'image/webp' ? blobOf(900 * KB, 'image/png') : blobOf(400 * KB, type)) });
    const result = await shrinkImage(fileOf(4 * MB, 'image/jpeg'), 1600, deps);
    expect(deps.encode).toHaveBeenLastCalledWith(expect.anything(), 1600, 1200, 'image/jpeg', 0.85);
    expect(result.ok && result.file.type).toBe('image/jpeg');
    expect(result.ok && result.file.name).toBe('photo.jpg');
  });

  it('keeps transparency as PNG when WebP is not available', async () => {
    const deps = fakeDeps({ alpha: true, encode: (type) => (type === 'image/jpeg' ? blobOf(10, type) : blobOf(1 * MB, 'image/png')) });
    const result = await shrinkImage(fileOf(3 * MB, 'image/png', 'logo.png'), 1600, deps);
    expect(result.ok && result.file.type).toBe('image/png');
    expect(result.ok && result.file.name).toBe('logo.png');
    expect(deps.encode).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'image/jpeg', expect.anything());

    const tooBig = fakeDeps({ alpha: true, encode: () => blobOf(3 * MB, 'image/png') });
    expect(await shrinkImage(fileOf(5 * MB, 'image/png', 'logo.png'), 1600, tooBig)).toEqual({ ok: false, error: 'too_large' });
  });

  it('keeps the original when the new file would be bigger', async () => {
    const file = fileOf(500 * KB, 'image/webp', 'a.webp');
    const result = await shrinkImage(file, 1600, fakeDeps({ encode: (type) => blobOf(700 * KB, type) }));
    expect(result.ok && result.file).toBe(file);
  });

  it('sends a picture it cannot read as it is, if the server would take it', async () => {
    const small = fileOf(1 * MB, 'image/jpeg');
    expect(await shrinkImage(small, 1600, fakeDeps({ size: null }))).toEqual({ ok: true, file: small });
    expect(await shrinkImage(fileOf(3 * MB, 'image/jpeg'), 1600, fakeDeps({ size: null }))).toEqual({ ok: false, error: 'bad_image' });
  });

  it('refuses a file over 20 MB without reading it', async () => {
    const deps = fakeDeps({});
    expect(await shrinkImage(fileOf(RAW_IMAGE_MAX_BYTES + 1, 'image/jpeg'), 1600, deps)).toEqual({ ok: false, error: 'image_raw_too_large' });
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it('refuses types the server does not take', async () => {
    const deps = fakeDeps({});
    expect(await shrinkImage(fileOf(100, 'image/gif', 'a.gif'), 1600, deps)).toEqual({ ok: false, error: 'bad_image' });
    expect(deps.decode).not.toHaveBeenCalled();
  });

  it('shrinks avatars to 512 px even when they are light', async () => {
    const deps = fakeDeps({ size: { width: 1024, height: 768 }, encode: (type) => blobOf(40 * KB, type) });
    const result = await shrinkImage(fileOf(200 * KB, 'image/jpeg'), 512, deps);
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 512, 384, 'image/webp', 0.82);
    expect(result.ok && result.file.size).toBe(40 * KB);
  });

  it('survives an encoder that throws', async () => {
    const file = fileOf(1 * MB, 'image/jpeg');
    const deps = fakeDeps({ encode: () => null });
    deps.encode = vi.fn(async () => {
      throw new Error('canvas');
    });
    expect(await shrinkImage(file, 1600, deps)).toEqual({ ok: true, file });
  });
});
