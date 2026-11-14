// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGroupInvites } from './api';
import { announceGroupInvitesChanged, useGroupInvites } from './useGroupInvites';
import { INVITES_POLL_MS } from './useInvites';

vi.mock('./api', () => ({ getGroupInvites: vi.fn() }));

const setVisibility = (value: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getGroupInvites).mockReset();
  vi.mocked(getGroupInvites).mockResolvedValue({ ok: true, data: [] });
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useGroupInvites (12k)', () => {
  it('polls every 30 seconds while the tab is visible', async () => {
    renderHook(() => useGroupInvites(true));
    await act(async () => {});
    expect(getGroupInvites).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(INVITES_POLL_MS);
    });
    expect(getGroupInvites).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(INVITES_POLL_MS);
    });
    expect(getGroupInvites).toHaveBeenCalledTimes(2);
  });

  it('refetches when the tab becomes visible', async () => {
    renderHook(() => useGroupInvites(true));
    await act(async () => {});
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(getGroupInvites).toHaveBeenCalledTimes(2);
  });

  it('stays off when disabled and refetches on the changed event', async () => {
    const { rerender } = renderHook(({ on }) => useGroupInvites(on), { initialProps: { on: false } });
    await act(async () => {});
    expect(getGroupInvites).not.toHaveBeenCalled();
    rerender({ on: true });
    await act(async () => {});
    expect(getGroupInvites).toHaveBeenCalledTimes(1);
    await act(async () => announceGroupInvitesChanged());
    expect(getGroupInvites).toHaveBeenCalledTimes(2);
  });
});
