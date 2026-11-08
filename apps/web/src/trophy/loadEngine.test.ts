import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('./engine/trophy-engine');
  vi.resetModules();
});

describe('loadTrophyEngine', () => {
  it('a failed chunk gives null and is not loaded again', async () => {
    const factory = vi.fn(() => {
      throw new Error('chunk failed');
    });
    vi.doMock('./engine/trophy-engine', factory);
    const { loadTrophyEngine } = await import('./loadEngine');
    await expect(loadTrophyEngine()).resolves.toBeNull();
    await expect(loadTrophyEngine()).resolves.toBeNull();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('a loaded engine is the same object twice', async () => {
    const engine = { mount: vi.fn() };
    const factory = vi.fn(() => ({ engine }));
    vi.doMock('./engine/trophy-engine', factory);
    const { loadTrophyEngine } = await import('./loadEngine');
    const first = await loadTrophyEngine();
    expect(first).toBe(engine);
    expect(await loadTrophyEngine()).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('webglAvailable', () => {
  it('releases the probe context after checking', async () => {
    const loseContext = vi.fn();
    const gl = { getExtension: vi.fn(() => ({ loseContext })) };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => gl }) });
    const { webglAvailable } = await import('./loadEngine');
    expect(webglAvailable()).toBe(true);
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
