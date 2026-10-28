// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

let visibility: 'visible' | 'hidden' = 'visible';
type FakeSentinel = EventTarget & { released: boolean; release: ReturnType<typeof vi.fn> };
let sentinels: FakeSentinel[];
let request: ReturnType<typeof vi.fn>;

const lock = () => {
  const sentinel = Object.assign(new EventTarget(), {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
      sentinel.dispatchEvent(new Event('release'));
    }),
  }) as FakeSentinel;
  sentinels.push(sentinel);
  return sentinel;
};
/** Браузер сам знімає блокування (економія заряду): сентинел released і подія release. */
const dropByBrowser = (sentinel: FakeSentinel) =>
  act(async () => {
    sentinel.released = true;
    sentinel.dispatchEvent(new Event('release'));
  });
const flush = () => act(async () => {});

beforeEach(() => {
  visibility = 'visible';
  sentinels = [];
  request = vi.fn(async () => lock());
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('useWakeLock', () => {
  it('keeps the screen awake while active and lets it go on cleanup', async () => {
    const hook = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    hook.rerender({ on: false });
    await flush();
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it('asks again when the page is visible after the browser dropped the lock', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    sentinels[0].released = true;
    visibility = 'hidden';
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('asks again on the sentinel release while the page is visible, not while hidden', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    await dropByBrowser(sentinels[0]);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    visibility = 'hidden';
    await dropByBrowser(sentinels[1]);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('a tap, a click or a key asks again when the lock is not held; a held lock is not asked twice', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    const hook = renderHook(() => useWakeLock(true));
    await flush();
    expect(hook.result.current).toBe(true);
    await act(async () => void document.dispatchEvent(new Event('touchend')));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(hook.result.current).toBe(false);
    await act(async () => void document.body.click());
    await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('cleanup does not ask again on the release it causes and removes the gesture listeners', async () => {
    const hook = renderHook(() => useWakeLock(true));
    await flush();
    hook.unmount();
    await flush();
    expect(sentinels[0].release).toHaveBeenCalled();
    await act(async () => void document.body.click());
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports true without the API or after a refusal, false while the lock is held or inactive', async () => {
    const held = renderHook(() => useWakeLock(true));
    await flush();
    expect(held.result.current).toBe(false);
    held.unmount();
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    const refused = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await flush();
    expect(refused.result.current).toBe(true);
    refused.rerender({ on: false });
    await flush();
    expect(refused.result.current).toBe(false);
    refused.unmount();
    Reflect.deleteProperty(navigator, 'wakeLock');
    const bare = renderHook(() => useWakeLock(true));
    await flush();
    expect(bare.result.current).toBe(true);
  });

  it('does nothing while inactive', async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('ignores a refusal and a missing API', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    const hook = renderHook(() => useWakeLock(true));
    await flush();
    hook.unmount();
    Reflect.deleteProperty(navigator, 'wakeLock');
    const bare = renderHook(() => useWakeLock(true));
    await flush();
    bare.unmount();
  });

  it('a lock granted after cleanup is released at once', async () => {
    let grant: (value: unknown) => void = () => {};
    request.mockReturnValueOnce(new Promise((resolve) => (grant = resolve)));
    const hook = renderHook(() => useWakeLock(true));
    hook.unmount();
    const late = lock();
    await act(async () => grant(late));
    expect(late.release).toHaveBeenCalled();
  });
});
