// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

let visibility: 'visible' | 'hidden' = 'visible';
let sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[];
let request: ReturnType<typeof vi.fn>;

const lock = () => {
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };
  sentinels.push(sentinel);
  return sentinel;
};
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
