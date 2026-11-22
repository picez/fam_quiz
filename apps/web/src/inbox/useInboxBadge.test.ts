// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { INBOX_POLL_MS } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInboxBadge } from '../api';
import { refreshInbox, setInboxUnread, useInboxBadge } from './useInboxBadge';

vi.mock('../api', () => ({ getInboxBadge: vi.fn() }));

const setVisibility = (value: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
let worker: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getInboxBadge).mockReset();
  vi.mocked(getInboxBadge).mockResolvedValue({ ok: true, unread: 3 });
  setVisibility('visible');
  worker = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('useInboxBadge (70)', () => {
  it('a disabled hook shows 0 and asks nothing', async () => {
    const { result } = renderHook(() => useInboxBadge(false));
    await act(async () => {});
    expect(result.current).toBe(0);
    expect(getInboxBadge).not.toHaveBeenCalled();
  });

  it('two hooks share one request, then ask again every minute while visible', async () => {
    const first = renderHook(() => useInboxBadge(true));
    const second = renderHook(() => useInboxBadge(true));
    await act(async () => {});
    expect(getInboxBadge).toHaveBeenCalledTimes(1);
    expect(first.result.current).toBe(3);
    expect(second.result.current).toBe(3);
    await act(async () => {
      vi.advanceTimersByTime(INBOX_POLL_MS);
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(INBOX_POLL_MS);
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(2);
  });

  it('a navigation refresh is skipped within 5 seconds, but a forced one is not', async () => {
    renderHook(() => useInboxBadge(true));
    await act(async () => {});
    await act(async () => {
      await refreshInbox();
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5_100);
      await refreshInbox();
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(2);
    await act(async () => {
      await refreshInbox(true);
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(3);
  });

  it('a service worker message «quiz:inbox» reads the badge at once', async () => {
    const { result } = renderHook(() => useInboxBadge(true));
    await act(async () => {});
    vi.mocked(getInboxBadge).mockResolvedValue({ ok: true, unread: 4 });
    await act(async () => {
      worker.dispatchEvent(new MessageEvent('message', { data: { type: 'quiz:inbox' } }));
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(4);
    await act(async () => {
      worker.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }));
    });
    expect(getInboxBadge).toHaveBeenCalledTimes(2);
  });

  it('setInboxUnread(0) updates every hook without a request', async () => {
    const first = renderHook(() => useInboxBadge(true));
    const second = renderHook(() => useInboxBadge(true));
    await act(async () => {});
    act(() => setInboxUnread(0));
    expect(first.result.current).toBe(0);
    expect(second.result.current).toBe(0);
    expect(getInboxBadge).toHaveBeenCalledTimes(1);
  });

  it('setInboxUnread drops the answer of a request that was already flying', async () => {
    let resolve!: (value: { ok: true; unread: number }) => void;
    vi.mocked(getInboxBadge).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useInboxBadge(true));
    act(() => setInboxUnread(0));
    await act(async () => {
      resolve({ ok: true, unread: 9 });
    });
    expect(result.current).toBe(0);
  });

  it('a failed read keeps the last value', async () => {
    const { result } = renderHook(() => useInboxBadge(true));
    await act(async () => {});
    vi.mocked(getInboxBadge).mockResolvedValue({ ok: false, error: 'offline' });
    await act(async () => {
      await refreshInbox(true);
    });
    expect(result.current).toBe(3);
  });
});
