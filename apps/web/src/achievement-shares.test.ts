// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAchievementShares } from './api';
import { forgetAchievementShares, useAchievementShares } from './achievement-shares';

vi.mock('./api', () => ({ getAchievementShares: vi.fn() }));

const DATA = { players: 200, holders: { first_win: 5 } };

beforeEach(() => {
  forgetAchievementShares();
  vi.clearAllMocks();
  vi.mocked(getAchievementShares).mockResolvedValue({ ok: true, data: DATA });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAchievementShares', () => {
  it('two hooks at once make one request', async () => {
    const a = renderHook(() => useAchievementShares());
    const b = renderHook(() => useAchievementShares());
    expect(a.result.current).toBeNull();
    await waitFor(() => expect(a.result.current).toEqual(DATA));
    await waitFor(() => expect(b.result.current).toEqual(DATA));
    expect(getAchievementShares).toHaveBeenCalledTimes(1);
  });

  it('a later mount within the hour shows the cache at once and asks nothing', async () => {
    const first = renderHook(() => useAchievementShares());
    await waitFor(() => expect(first.result.current).toEqual(DATA));
    first.unmount();
    const second = renderHook(() => useAchievementShares());
    expect(second.result.current).toEqual(DATA);
    expect(getAchievementShares).toHaveBeenCalledTimes(1);
  });

  it('asks again after the hour', async () => {
    const first = renderHook(() => useAchievementShares());
    await waitFor(() => expect(first.result.current).toEqual(DATA));
    first.unmount();
    const real = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(real + 3_600_001);
    const second = renderHook(() => useAchievementShares());
    await waitFor(() => expect(getAchievementShares).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current).toEqual(DATA));
    vi.restoreAllMocks();
  });

  it('a failure gives null and the next mount asks again', async () => {
    vi.mocked(getAchievementShares).mockResolvedValueOnce({ ok: false, error: 'network' });
    const first = renderHook(() => useAchievementShares());
    await waitFor(() => expect(getAchievementShares).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(first.result.current).toBeNull();
    first.unmount();
    const second = renderHook(() => useAchievementShares());
    await waitFor(() => expect(second.result.current).toEqual(DATA));
    expect(getAchievementShares).toHaveBeenCalledTimes(2);
  });
});
