// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Status } from './useGame';
import { useLiveWatch } from './useLiveWatch';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sender = () => vi.fn(async () => ({ ok: true as const }));

describe('useLiveWatch (12b)', () => {
  it('is on by default and declares it only once the socket is live', () => {
    const send = sender();
    const { result, rerender } = renderHook(({ status }: { status: Status }) => useLiveWatch(send, status), {
      initialProps: { status: 'connecting' },
    });
    expect(result.current[0]).toBe(true);
    expect(send).not.toHaveBeenCalled();
    rerender({ status: 'live' });
    expect(send).toHaveBeenCalledWith('host:live-watch', { on: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('remembers off on this device and tells the server', () => {
    const send = sender();
    const { result } = renderHook(() => useLiveWatch(send, 'live'));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('quiz:live-watch')).toBe('off');
    expect(send).toHaveBeenLastCalledWith('host:live-watch', { on: false });
    const again = renderHook(() => useLiveWatch(sender(), 'connecting'));
    expect(again.result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(localStorage.getItem('quiz:live-watch')).toBeNull();
    expect(send).toHaveBeenLastCalledWith('host:live-watch', { on: true });
  });

  it('declares the current choice again after every reconnect', () => {
    const send = sender();
    const { result, rerender } = renderHook(({ status }: { status: Status }) => useLiveWatch(send, status), {
      initialProps: { status: 'live' },
    });
    act(() => result.current[1](false));
    send.mockClear();
    rerender({ status: 'offline' });
    expect(send).not.toHaveBeenCalled();
    rerender({ status: 'live' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('host:live-watch', { on: false });
    rerender({ status: 'restarting' });
    rerender({ status: 'live' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stays on when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const send = sender();
    const { result } = renderHook(() => useLiveWatch(send, 'live'));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
