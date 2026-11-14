// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '@quiz/shared';
import { NET_PING_EVERY_MS, NET_PING_TIMEOUT_MS, STALE_AFTER_MS } from './net-quality';
import { ACK_TIMEOUT_MS, DRAW_SNAPSHOT_WAIT_MS, DRAW_SYNC_RETRY_MS, RETRY_MS, useGame } from './useGame';

const { sockets, FakeSocket } = vi.hoisted(() => {
  /** Підставний сокет: тест сам вирішує, які події прийшли із сервера. */
  class FakeSocket {
    connected = true;
    active = true;
    connect = vi.fn();
    close = vi.fn();
    disconnect = vi.fn();
    /** Події з ack через socket.timeout(ms).emit (32): ack(err, result); err — тайм-аут socket.io. */
    timed: { event: string; args: unknown[]; ms: number; ack: (err: Error | null, result?: unknown) => void; done: boolean }[] = [];
    timeout(ms: number) {
      return {
        emit: (event: string, ...rest: unknown[]) => {
          const callback = rest.pop() as (err: Error | null, result?: unknown) => void;
          const entry = { event, args: rest, ms, done: false, ack: (err: Error | null, result?: unknown) => {
            if (entry.done) return;
            entry.done = true;
            callback(err, result);
          } };
          this.timed.push(entry);
          setTimeout(() => entry.ack(new Error('operation has timed out')), ms);
        },
      };
    }
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
const meta = (stageOnline = true) => ({ serverNow: Date.now(), hostOnline: true, stageOnline });

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

describe('useGame audio', () => {
  it('keeps the last audio command and reads stageOnline from the meta', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    expect(result.current.stageOnline).toBe(true);
    expect(result.current.audioCommand).toBeNull();
    act(() => socket.fire('state', view, meta(false)));
    expect(result.current.stageOnline).toBe(false);
    act(() => socket.fire('audio', { action: 'replay', seq: 5 }));
    expect(result.current.audioCommand).toEqual({ action: 'replay', seq: 5 });
    act(() => socket.fire('audio', { action: 'stop', seq: 6 }));
    expect(result.current.audioCommand).toEqual({ action: 'stop', seq: 6 });
  });
});

describe('useGame tilts (11d)', () => {
  const tilt = (patch = {}) => ({ sorterId: 'p1', wordId: 'w1', toward: 'c1', amount: 0.5, seq: 0, ...patch });

  it('keeps the latest tilt per sorter', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    expect(result.current.tilts).toEqual({});
    act(() => socket.fire('sort:tilt', tilt()));
    expect(result.current.tilts.p1).toEqual(tilt());
    act(() => socket.fire('sort:tilt', tilt({ amount: 0.8 })));
    act(() => socket.fire('sort:tilt', tilt({ sorterId: 'p2', toward: 'c2' })));
    expect(result.current.tilts.p1.amount).toBe(0.8);
    expect(result.current.tilts.p2.toward).toBe('c2');
  });

  it('forgets tilts on a paused state, and on a lost connection', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('sort:tilt', tilt()));
    act(() => socket.fire('state', view, meta()));
    expect(result.current.tilts.p1).toBeDefined();
    act(() => socket.fire('state', { ...view, paused: true }, meta()));
    expect(result.current.tilts).toEqual({});
    act(() => socket.fire('sort:tilt', tilt()));
    act(() => socket.fire('disconnect', 'transport close'));
    expect(result.current.tilts).toEqual({});
  });

  it('forgets tilts when the question changes', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', { ...view, questionIndex: 0 }, meta()));
    act(() => socket.fire('sort:tilt', tilt()));
    act(() => socket.fire('state', { ...view, questionIndex: 0 }, meta()));
    expect(result.current.tilts.p1).toBeDefined();
    act(() => socket.fire('state', { ...view, questionIndex: 1 }, meta()));
    expect(result.current.tilts).toEqual({});
  });
});

describe('useGame host drafts (12b)', () => {
  const batch = (questionIndex = 0) => ({
    questionIndex,
    trial: false,
    drafts: [{ id: 'p1', draft: { type: 'text', value: 'Осака' }, changes: 1, at: 5 }],
  });

  it('keeps the latest batch and drops it on a new question', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    expect(result.current.drafts).toBeNull();
    act(() => socket.fire('state', { ...view, questionIndex: 0 }, meta()));
    act(() => socket.fire('host:drafts', batch()));
    expect(result.current.drafts).toEqual(batch());
    act(() => socket.fire('state', { ...view, questionIndex: 0 }, meta()));
    expect(result.current.drafts).toEqual(batch());
    act(() => socket.fire('state', { ...view, questionIndex: 1 }, meta()));
    expect(result.current.drafts).toBeNull();
  });

  it('drops the batch on a lost connection', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('host:drafts', batch()));
    act(() => socket.fire('disconnect', 'transport close'));
    expect(result.current.drafts).toBeNull();
  });

  it('forgetLive drops the held batch and tilts, so a switched-off host shows nothing stale later', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('host:drafts', batch()));
    act(() => socket.fire('sort:tilt', { sorterId: 'p1', wordId: 'w1', toward: 'c1', amount: 0.5, seq: 0 }));
    act(() => result.current.forgetLive());
    expect(result.current.drafts).toBeNull();
    expect(result.current.tilts).toEqual({});
  });
});

describe('useGame reactions (13a)', () => {
  const reaction = (patch = {}) => ({ seq: 1, by: 'p1', nickname: 'Оля', rowId: 'p1', item: { kind: 'emoji', value: '👏' }, ...patch });

  it('keeps the latest reaction of each person for 4 s', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    expect(result.current.reactions).toEqual([]);
    act(() => socket.fire('reaction', reaction()));
    expect(result.current.reactions).toEqual([reaction()]);
    act(() => vi.advanceTimersByTime(1000));
    act(() => socket.fire('reaction', reaction({ seq: 2, item: { kind: 'sticker', value: 'nyaBeach' } })));
    expect(result.current.reactions).toEqual([reaction({ seq: 2, item: { kind: 'sticker', value: 'nyaBeach' } })]);
    // Таймер першої (через 4000 мс від неї) не прибирає другу.
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.reactions).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.reactions).toEqual([]);
  });

  it('a lost connection forgets the reactions', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('reaction', reaction()));
    act(() => socket.fire('reaction', reaction({ seq: 2, by: 'host', nickname: null, rowId: null })));
    expect(result.current.reactions).toHaveLength(2);
    act(() => socket.fire('disconnect', 'transport close'));
    expect(result.current.reactions).toEqual([]);
  });
});

describe('useGame drawing (28c)', () => {
  const drawingView = (questionIndex: number, rev: number) => ({ ...view, questionIndex, drawing: { rev } }) as unknown as GameView;
  const syncCalls = (socket: (typeof sockets)[number]) => (socket.emit as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call) => call[0] === 'draw:sync');
  const spy = (socket: (typeof sockets)[number]) => {
    socket.emit = vi.fn() as never;
    return socket;
  };

  it('a drawing event gives the model, a fresh question starts empty', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = spy(sockets[0]);
    act(() => socket.fire('state', { ...view, questionIndex: 1 }, meta()));
    expect(result.current.drawing).toBeNull();
    act(() => socket.fire('state', drawingView(2, 0), meta()));
    expect(result.current.drawing).toEqual({ questionIndex: 2, rev: 0, strokes: [], stale: false });
    act(() => socket.fire('drawing', { kind: 'ops', questionIndex: 2, rev: 1, op: { op: 'begin', c: 0, w: 1, p: [10, 10] } }));
    expect(result.current.drawing?.strokes).toEqual([{ c: 0, w: 1, p: [10, 10] }]);
    expect(syncCalls(socket)).toHaveLength(0);
  });

  it('useDrawing resyncs when the view is ahead, but not before the snapshot that follows a connect', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = spy(sockets[0]);
    // Підключення посеред малюнка: сервер шле зріз (rev 2), а слідом — повний знімок. Просити самому не треба.
    act(() => socket.fire('state', drawingView(2, 2), meta()));
    act(() => socket.fire('state', drawingView(2, 2), meta()));
    expect(syncCalls(socket)).toHaveLength(0);
    act(() => result.current.requestSync());
    expect(syncCalls(socket)).toHaveLength(0);
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 2, strokes: [{ c: 1, w: 0, p: [1, 1] }, { c: 1, w: 0, p: [2, 2] }] }));
    expect(result.current.drawing).toMatchObject({ rev: 2, stale: false });
    // Зріз випередив модель: одна подія штриха загубилася.
    act(() => socket.fire('state', drawingView(2, 4), meta()));
    expect(syncCalls(socket)).toHaveLength(1);
    // Поки відповіді немає, другий запит не йде.
    act(() => socket.fire('state', drawingView(2, 5), meta()));
    expect(syncCalls(socket)).toHaveLength(1);
    const ack = syncCalls(socket)[0]![1] as (result: { ok: boolean }) => void;
    act(() => ack({ ok: true }));
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 5, strokes: [] }));
    expect(result.current.drawing).toMatchObject({ rev: 5, strokes: [] });
  });

  it('the snapshot that comes before the first view is not awaited again', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = spy(sockets[0]);
    // Сервер шле знімок раніше за перший зріз.
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 3, strokes: [{ c: 1, w: 0, p: [1, 1] }] }));
    act(() => socket.fire('state', drawingView(2, 3), meta()));
    expect(result.current.drawing).toMatchObject({ questionIndex: 2, rev: 3 });
    expect(syncCalls(socket)).toHaveLength(0);
    // Зріз випередив модель — запит одразу, без очікування знімка.
    act(() => socket.fire('state', drawingView(2, 4), meta()));
    expect(syncCalls(socket)).toHaveLength(1);
  });

  it('without a snapshot the client asks itself after DRAW_SNAPSHOT_WAIT_MS, and retries a too_soon after DRAW_SYNC_RETRY_MS', () => {
    renderHook(() => useGame(auth));
    const socket = spy(sockets[0]);
    act(() => socket.fire('state', drawingView(2, 3), meta()));
    act(() => vi.advanceTimersByTime(DRAW_SNAPSHOT_WAIT_MS - 1));
    expect(syncCalls(socket)).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(syncCalls(socket)).toHaveLength(1);
    const ack = syncCalls(socket)[0]![1] as (result: { ok: false; error: string }) => void;
    act(() => ack({ ok: false, error: 'too_soon' }));
    act(() => vi.advanceTimersByTime(DRAW_SYNC_RETRY_MS - 1));
    expect(syncCalls(socket)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(syncCalls(socket)).toHaveLength(2);
    // Знімок прийшов — більше не просить.
    act(() => (syncCalls(socket)[1]![1] as (result: { ok: true }) => void)({ ok: true }));
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 3, strokes: [] }));
    act(() => vi.advanceTimersByTime(DRAW_SNAPSHOT_WAIT_MS * 2));
    expect(syncCalls(socket)).toHaveLength(2);
  });

  it('an op past a gap asks for a sync', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = spy(sockets[0]);
    act(() => socket.fire('state', drawingView(2, 0), meta()));
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 0, strokes: [] }));
    act(() => socket.fire('drawing', { kind: 'ops', questionIndex: 2, rev: 3, op: { op: 'undo' } }));
    expect(result.current.drawing?.stale).toBe(true);
    expect(syncCalls(socket)).toHaveLength(1);
  });

  it('a lost connection drops the model and the next connect waits for its snapshot again', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = spy(sockets[0]);
    act(() => socket.fire('state', drawingView(2, 0), meta()));
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 0, strokes: [] }));
    expect(result.current.drawing).not.toBeNull();
    act(() => socket.fire('disconnect', 'transport close'));
    expect(result.current.drawing).toBeNull();
    act(() => socket.fire('state', drawingView(2, 7), meta()));
    expect(syncCalls(socket)).toHaveLength(0);
    act(() => socket.fire('drawing', { kind: 'sync', questionIndex: 2, rev: 7, strokes: [] }));
    expect(result.current.drawing?.rev).toBe(7);
  });
});

describe('useGame connection quality (32)', () => {
  type Fake = (typeof sockets)[number];
  const pings = (socket: Fake) => socket.timed.filter((entry) => entry.event === 'net:ping');
  const lastPing = (socket: Fake) => pings(socket).at(-1)!;
  // Пінги йдуть з інтервалом від першого зрізу: помічники доходять рівно до наступного тіку.
  let nextTick = 0;
  const start = (socket: Fake) => {
    act(() => socket.fire('state', view, meta()));
    nextTick = Date.now() + NET_PING_EVERY_MS;
  };
  const toTick = () => {
    act(() => vi.advanceTimersByTime(nextTick - Date.now()));
    nextTick += NET_PING_EVERY_MS;
  };
  /** Наступний пінг і відповідь через rtt мс. */
  const pong = (socket: Fake, rtt: number) => {
    toTick();
    const entry = lastPing(socket);
    act(() => vi.advanceTimersByTime(rtt));
    act(() => entry.ack(null, { now: Date.now() }));
  };
  /** Наступний пінг без відповіді: тайм-аут NET_PING_TIMEOUT_MS. */
  const miss = (socket: Fake) => {
    toTick();
    expect(lastPing(socket).done).toBe(false);
    act(() => vi.advanceTimersByTime(NET_PING_TIMEOUT_MS));
  };
  let visibility: DocumentVisibilityState = 'visible';
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => vi.restoreAllMocks());

  it('pings every 5 s after the first view and turns weak on slow answers', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => vi.advanceTimersByTime(NET_PING_EVERY_MS * 2));
    expect(pings(socket)).toHaveLength(0);
    start(socket);
    pong(socket, 100);
    expect(pings(socket)).toHaveLength(1);
    expect(lastPing(socket).ms).toBe(NET_PING_TIMEOUT_MS);
    expect(result.current.quality).toBe('good');
    pong(socket, 1000);
    pong(socket, 1000);
    pong(socket, 1000);
    expect(result.current.quality).toBe('weak');
  });

  it('does not ping in a hidden tab and pings at once when it is visible again', () => {
    renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(NET_PING_EVERY_MS * 3));
    expect(pings(socket)).toHaveLength(0);
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(pings(socket)).toHaveLength(1);
  });

  it('three missed pings after an answered one reconnect once; without any answer they do not', () => {
    renderHook(() => useGame(auth));
    const socket = sockets[0];
    start(socket);
    miss(socket);
    miss(socket);
    miss(socket);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
    pong(socket, 50);
    miss(socket);
    miss(socket);
    expect(socket.disconnect).not.toHaveBeenCalled();
    miss(socket);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects at once when the device comes back online', () => {
    renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    socket.connected = false;
    act(() => socket.fire('disconnect', 'transport close'));
    act(() => window.dispatchEvent(new Event('online')));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    // socket.connect() посеред затримки socket.io нічого не робить: спершу disconnect() скидає ту затримку.
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.disconnect.mock.invocationCallOrder[0]).toBeLessThan(socket.connect.mock.invocationCallOrder[0]!);
    // Уже на зв'язку — online нічого не робить.
    socket.connected = true;
    act(() => window.dispatchEvent(new Event('online')));
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects when the tab comes back after a long silence', () => {
    renderHook(() => useGame(auth));
    const socket = sockets[0];
    start(socket);
    pong(socket, 50);
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    socket.connected = false;
    act(() => vi.advanceTimersByTime(STALE_AFTER_MS + 1));
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('an ack that never comes is offline after 8 s', async () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    let settled: unknown = null;
    void result.current.send('player:buzz').then((value) => (settled = value));
    const entry = socket.timed.find((one) => one.event === 'player:buzz')!;
    expect(entry.ms).toBe(ACK_TIMEOUT_MS);
    expect(entry.args).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(settled).toEqual({ ok: false, error: 'offline' });
  });

  it('an ack that comes in time is passed on, with the payload sent', async () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    const pending = result.current.send('player:answer', { type: 'single', optionId: 'a' } as never);
    const entry = socket.timed.find((one) => one.event === 'player:answer')!;
    expect(entry.args).toEqual([{ type: 'single', optionId: 'a' }]);
    entry.ack(null, { ok: false, error: 'already_answered' });
    expect(await pending).toEqual({ ok: false, error: 'already_answered' });
  });

  it('stops pinging on a disconnect and starts again with the next view', () => {
    renderHook(() => useGame(auth));
    const socket = sockets[0];
    start(socket);
    pong(socket, 50);
    socket.connected = false;
    act(() => socket.fire('disconnect', 'transport close'));
    act(() => vi.advanceTimersByTime(NET_PING_EVERY_MS * 3));
    expect(pings(socket)).toHaveLength(1);
    socket.connected = true;
    act(() => socket.fire('state', view, meta()));
    act(() => vi.advanceTimersByTime(NET_PING_EVERY_MS));
    expect(pings(socket)).toHaveLength(2);
  });

  it('unmounting removes its listeners and timers', () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', view, meta()));
    unmount();
    expect(removeWindow.mock.calls.map(([type]) => type)).toContain('online');
    expect(removeDocument.mock.calls.map(([type]) => type)).toContain('visibilitychange');
    act(() => vi.advanceTimersByTime(NET_PING_EVERY_MS * 3));
    expect(pings(socket)).toHaveLength(0);
    act(() => window.dispatchEvent(new Event('online')));
    expect(socket.connect).not.toHaveBeenCalled();
  });
});

describe('useGame answer around a blip (32)', () => {
  type Fake = (typeof sockets)[number];
  const answer = { type: 'single', optionId: 'b' };
  const onQuestion = (questionIndex: number, mine: unknown = null, phase = 'question') =>
    ({ role: 'player', phase, splash: null, questionIndex, me: { answer: mine } }) as unknown as GameView;
  const answers = (socket: Fake) => socket.timed.filter((entry) => entry.event === 'player:answer');
  const drop = (socket: Fake) => {
    socket.connected = false;
    act(() => socket.fire('disconnect', 'transport close'));
    socket.connected = true;
  };

  it('sends a lost answer once more after the reconnect when the snapshot shows it never arrived', async () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', onQuestion(3), meta()));
    let first: unknown = null;
    void result.current.send('player:answer', answer).then((value) => (first = value));
    drop(socket);
    await act(async () => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(first).toEqual({ ok: false, error: 'offline' });
    expect(result.current.answerPending).toBe(true);
    act(() => socket.fire('state', onQuestion(3), meta()));
    expect(answers(socket)).toHaveLength(2);
    expect(answers(socket)[1]!.args).toEqual([answer]);
    await act(async () => answers(socket)[1]!.ack(null, { ok: false, error: 'already_answered' }));
    expect(result.current.answerPending).toBe(false);
    drop(socket);
    act(() => socket.fire('state', onQuestion(3), meta()));
    expect(answers(socket)).toHaveLength(2);
  });

  it('does not repeat an answer the snapshot already has', async () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', onQuestion(3), meta()));
    void result.current.send('player:answer', answer);
    drop(socket);
    act(() => socket.fire('state', onQuestion(3, answer), meta()));
    expect(answers(socket)).toHaveLength(1);
    expect(result.current.answerPending).toBe(false);
    drop(socket);
    act(() => socket.fire('state', onQuestion(3), meta()));
    expect(answers(socket)).toHaveLength(1);
  });

  it('forgets the answer when the game has moved on', () => {
    for (const next of [onQuestion(4), onQuestion(3, null, 'reveal')]) {
      sockets.length = 0;
      const { result, unmount } = renderHook(() => useGame(auth));
      const socket = sockets[0];
      act(() => socket.fire('state', onQuestion(3), meta()));
      void result.current.send('player:answer', answer);
      drop(socket);
      act(() => socket.fire('state', next, meta()));
      expect(answers(socket)).toHaveLength(1);
      drop(socket);
      act(() => socket.fire('state', onQuestion(3), meta()));
      expect(answers(socket)).toHaveLength(1);
      unmount();
    }
  });

  it('an answer acked in time leaves nothing to repeat', async () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', onQuestion(3), meta()));
    const pending = result.current.send('player:answer', answer);
    answers(socket)[0]!.ack(null, { ok: true });
    expect(await pending).toEqual({ ok: true });
    drop(socket);
    act(() => socket.fire('state', onQuestion(3), meta()));
    expect(answers(socket)).toHaveLength(1);
  });

  it('repeats only answers, never a buzz', () => {
    const { result } = renderHook(() => useGame(auth));
    const socket = sockets[0];
    act(() => socket.fire('state', onQuestion(3), meta()));
    void result.current.send('player:buzz');
    drop(socket);
    act(() => socket.fire('state', onQuestion(3), meta()));
    expect(socket.timed.filter((entry) => entry.event === 'player:buzz')).toHaveLength(1);
  });
});
