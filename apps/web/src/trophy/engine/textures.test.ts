import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class HangingImage {
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Image', HangingImage);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('domTextures.image', () => {
  it('a never-settling image resolves null after the timeout, not before, and is not cached', async () => {
    const { domTextures, IMAGE_LOAD_TIMEOUT_MS } = await import('./textures');
    expect(IMAGE_LOAD_TIMEOUT_MS).toBe(8000);
    let settled: unknown = 'pending';
    const first = domTextures.image('/never.png');
    void first.then((value) => (settled = value));
    await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS - 1);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
    expect(domTextures.image('/never.png')).not.toBe(first);
  });

  it('image cache is bounded', async () => {
    const created: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        width = 4;
        height = 4;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(url: string) {
          created.push(url);
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const { domTextures, IMAGE_CACHE_MAX, imageCacheSize } = await import('./textures');
    expect(IMAGE_CACHE_MAX).toBe(48);
    for (let i = 0; i < 50; i++) expect(await domTextures.image(`/p${i}.png`)).not.toBeNull();
    expect(imageCacheSize()).toBeLessThanOrEqual(48);
    expect(created).toHaveLength(50);
    // Останні просили щойно — вони в кеші; перший давно не просили — вантажиться знову.
    await domTextures.image('/p49.png');
    expect(created).toHaveLength(50);
    await domTextures.image('/p0.png');
    expect(created).toHaveLength(51);
    expect(created.at(-1)).toBe('/p0.png');
  });
});

describe('domTextures.canvas', () => {
  it('same key, same texture', async () => {
    const context = {} as CanvasRenderingContext2D;
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    });
    const { domTextures } = await import('./textures');
    const draw = vi.fn();
    const first = domTextures.canvas('k', 4, 4, draw);
    const second = domTextures.canvas('k', 4, 4, draw);
    expect(second).toBe(first);
    expect(draw).toHaveBeenCalledTimes(1);
    const dispose = vi.spyOn(first, 'dispose');
    domTextures.release(first);
    expect(dispose).not.toHaveBeenCalled();
    domTextures.release(second);
    expect(dispose).toHaveBeenCalledTimes(1);
    const again = domTextures.canvas('k', 4, 4, draw);
    expect(again).not.toBe(first);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('an unknown texture is disposed at once', async () => {
    const { domTextures } = await import('./textures');
    const { Texture } = await import('three');
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    domTextures.release(texture);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
