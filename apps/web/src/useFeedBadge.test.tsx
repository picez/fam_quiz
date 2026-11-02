// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { FEED_POLL_MS } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeedBadge } from './api';
import { announceFeedSeen, useFeedBadge } from './useFeedBadge';

vi.mock('./api', () => ({ getFeedBadge: vi.fn() }));

const setVisibility = (value: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
const ZERO = { events: 0, requests: 0, decisions: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getFeedBadge).mockReset();
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 2, requests: 0, decisions: 0 });
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useFeedBadge', () => {
  it('asks on start, then every 30 seconds while visible, and not while hidden', async () => {
    const { result } = renderHook(() => useFeedBadge(true));
    expect(result.current).toEqual(ZERO);
    await act(async () => {});
    expect(getFeedBadge).toHaveBeenCalledTimes(1);
    expect(result.current.events).toBe(2);
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS);
    });
    expect(getFeedBadge).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS);
    });
    expect(getFeedBadge).toHaveBeenCalledTimes(2);
  });

  it('asks again when the page has marked the feed as seen', async () => {
    renderHook(() => useFeedBadge(true));
    await act(async () => {});
    vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, ...ZERO });
    await act(async () => {
      announceFeedSeen();
    });
    expect(getFeedBadge).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous value on an error', async () => {
    const { result } = renderHook(() => useFeedBadge(true));
    await act(async () => {});
    vi.mocked(getFeedBadge).mockResolvedValue({ ok: false, error: 'network' } as never);
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS);
    });
    expect(result.current.events).toBe(2);
  });

  it('is zeros and silent when disabled', async () => {
    const { result } = renderHook(() => useFeedBadge(false));
    await act(async () => {
      vi.advanceTimersByTime(FEED_POLL_MS);
    });
    expect(getFeedBadge).not.toHaveBeenCalled();
    expect(result.current).toEqual(ZERO);
  });
});
