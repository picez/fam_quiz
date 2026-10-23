// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '@quiz/shared';
import { RETRY_MS, useGame } from './useGame';

const { sockets, FakeSocket } = vi.hoisted(() => {
  /** Підставний сокет: тест сам вирішує, які події прийшли із сервера. */
  class FakeSocket {
    connected = true;
    active = true;
    connect = vi.fn();
    close = vi.fn();
    private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit() {}
    fire(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }
  return { sockets: [] as FakeSocket[], FakeSocket };
});

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const auth = { code: '123456', role: 'player', token: 't1' } as const;
const view = { role: 'player', phase: 'question', splash: null } as unknown as GameView;
const meta = () => ({ serverNow: Date.now(), hostOnline: true });

describe('useGame across a server restart', () => {
  it('shows restarting after the server says so and reconnects by itself after a server-side disconnect', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    act(() => socket.fire('restarting'));
    expect(result.current.status).toBe('restarting');
    act(() => socket.fire('disconnect', 'io server disconnect'));
    expect(result.current.status).toBe('restarting');
    expect(socket.connect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(RETRY_MS));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    act(() => socket.fire('state', view, meta()));
    expect(result.current.status).toBe('live');
  });

  it('treats a server-side disconnect without a notice as a restart too', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    act(() => socket.fire('disconnect', 'io server disconnect'));
    expect(result.current.status).toBe('restarting');
    act(() => vi.advanceTimersByTime(RETRY_MS));
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('keeps trying while the server answers restarting', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    socket.active = false;
    act(() => socket.fire('connect_error', new Error('restarting')));
    expect(result.current.status).toBe('restarting');
    act(() => vi.advanceTimersByTime(RETRY_MS));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    act(() => socket.fire('connect_error', new Error('restarting')));
    act(() => vi.advanceTimersByTime(RETRY_MS));
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('a transport error is offline without a restart notice, restarting after one', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('connect_error', new Error('websocket error')));
    expect(result.current.status).toBe('offline');
    act(() => vi.advanceTimersByTime(RETRY_MS * 2));
    expect(socket.connect).not.toHaveBeenCalled();
    act(() => socket.fire('restarting'));
    act(() => socket.fire('connect_error', new Error('websocket error')));
    expect(result.current.status).toBe('restarting');
  });

  it('a kicked player is not reconnected', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('closed', 'kicked'));
    act(() => socket.fire('disconnect', 'io server disconnect'));
    expect(result.current.closed).toBe('kicked');
    act(() => vi.advanceTimersByTime(RETRY_MS * 2));
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
