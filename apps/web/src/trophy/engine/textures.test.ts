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
});
