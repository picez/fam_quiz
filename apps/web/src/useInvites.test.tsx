// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyInvites } from './api';
import { announceInvitesChanged, INVITES_POLL_MS, useInvites } from './useInvites';

vi.mock('./api', () => ({ getMyInvites: vi.fn() }));

const setVisibility = (value: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getMyInvites).mockReset();
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useInvites', () => {
  it('polls every 30 seconds while the tab is visible', async () => {
    renderHook(() => useInvites(true));
    await act(async () => {});
    expect(getMyInvites).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(INVITES_POLL_MS);
    });
    expect(getMyInvites).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(INVITES_POLL_MS);
    });
    expect(getMyInvites).toHaveBeenCalledTimes(2);
  });

  it('stays off when disabled and refetches on the changed event', async () => {
    const { rerender } = renderHook(({ on }) => useInvites(on), { initialProps: { on: false } });
    await act(async () => {});
    expect(getMyInvites).not.toHaveBeenCalled();
    rerender({ on: true });
    await act(async () => {});
    expect(getMyInvites).toHaveBeenCalledTimes(1);
    await act(async () => announceInvitesChanged());
    expect(getMyInvites).toHaveBeenCalledTimes(2);
  });
});
