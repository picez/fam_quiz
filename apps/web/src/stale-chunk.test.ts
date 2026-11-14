// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkUrlOf, installStaleChunkReload, STALE_RELOAD_KEY, STALE_RELOAD_WINDOW_MS } from './stale-chunk';

const CHUNK = 'http://localhost/assets/EditQuiz-abc123.js';

const fire = (payload: unknown = new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`)) => {
  const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload });
  window.dispatchEvent(event);
  return event;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(over: { status?: number; path?: string; online?: boolean; now?: () => number } = {}) {
  const reload = vi.fn();
  const fetch = vi.fn(async () => ({ status: over.status ?? 404 }));
  const uninstall = installStaleChunkReload({ reload, fetch, now: over.now ?? (() => 1_000_000), path: () => over.path ?? '/quizzes/new', online: () => over.online ?? true });
  return { reload, fetch, uninstall };
}

describe('stale chunk reload', () => {
  let uninstall = () => {};
  afterEach(() => {
    uninstall();
    sessionStorage.clear();
  });

  it('reloads once when the chunk is really gone (404) and lets the error reach local handlers', async () => {
    const s = setup();
    uninstall = s.uninstall;
    expect(fire().defaultPrevented).toBe(false);
    await settle();
    expect(s.fetch).toHaveBeenCalledWith(CHUNK, { method: 'HEAD', cache: 'no-store' });
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_RELOAD_KEY)).toBe('1000000');
    fire();
    await settle();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the file is there or the server fails (a weak network, not a deploy)', async () => {
    for (const status of [200, 503]) {
      const s = setup({ status });
      fire();
      await settle();
      expect(s.reload).not.toHaveBeenCalled();
      s.uninstall();
    }
  });

  it('never reloads offline, on a game screen or without a chunk address', async () => {
    for (const over of [{ online: false }, { path: '/play/123456' }, { path: '/host/123456' }, { path: '/stage/123456' }]) {
      const s = setup(over);
      fire();
      await settle();
      expect(s.fetch).not.toHaveBeenCalled();
      expect(s.reload).not.toHaveBeenCalled();
      s.uninstall();
    }
    const s = setup();
    uninstall = s.uninstall;
    fire(new Error('boom'));
    await settle();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('allows another reload once the mark is older than 30 s', async () => {
    sessionStorage.setItem(STALE_RELOAD_KEY, '1000');
    const s = setup({ now: () => 1000 + STALE_RELOAD_WINDOW_MS + 1 });
    uninstall = s.uninstall;
    fire();
    await settle();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('reads the chunk address from Vite errors', () => {
    expect(chunkUrlOf(new TypeError(`Failed to fetch dynamically imported module: ${CHUNK}`))).toBe(CHUNK);
    expect(chunkUrlOf(new Error('Unable to preload CSS for /assets/index-x1.css'))).toBe('/assets/index-x1.css');
    expect(chunkUrlOf(new Error('nothing here'))).toBeNull();
    expect(chunkUrlOf(undefined)).toBeNull();
  });

  it('stops listening when uninstalled', async () => {
    const s = setup();
    s.uninstall();
    fire();
    await settle();
    expect(s.fetch).not.toHaveBeenCalled();
  });
});
