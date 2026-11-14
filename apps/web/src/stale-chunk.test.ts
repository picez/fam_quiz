// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStaleChunkReload, STALE_RELOAD_KEY, STALE_RELOAD_WINDOW_MS } from './stale-chunk';

const fire = () => {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('stale chunk reload', () => {
  let uninstall = () => {};
  afterEach(() => {
    uninstall();
    sessionStorage.clear();
  });

  it('reloads once on a failed chunk and remembers it', () => {
    const reload = vi.fn();
    let now = 1_000_000;
    uninstall = installStaleChunkReload({ reload, now: () => now });
    expect(fire().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_RELOAD_KEY)).toBe('1000000');

    now += STALE_RELOAD_WINDOW_MS - 1;
    expect(fire().defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('allows another reload once the mark is older than 30 s', () => {
    const reload = vi.fn();
    sessionStorage.setItem(STALE_RELOAD_KEY, '1000');
    uninstall = installStaleChunkReload({ reload, now: () => 1000 + STALE_RELOAD_WINDOW_MS + 1 });
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops listening when uninstalled', () => {
    const reload = vi.fn();
    installStaleChunkReload({ reload, now: () => 5 * STALE_RELOAD_WINDOW_MS })();
    fire();
    expect(reload).not.toHaveBeenCalled();
  });
});
