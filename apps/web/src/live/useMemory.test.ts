// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryCellView, PlayerMemory } from '@quiz/shared';
import type { Send, SendResult } from './types';
import { MEMORY_ACK_MS, useMemory } from './useMemory';

const closed = (n = 12): (MemoryCellView | null)[] => new Array<MemoryCellView | null>(n).fill(null);
const card = (text: string, state: MemoryCellView['state'], tone: string | null = null): MemoryCellView => ({ text, imageUrl: null, state, tone });
const infoOf = (over: Partial<PlayerMemory> = {}): PlayerMemory => ({
  cells: closed(),
  pairs: 0,
  total: 6,
  moves: 0,
  done: false,
  canFlip: true,
  busy: null,
  closesInMs: null,
  seq: 0,
  timeMs: null,
  result: null,
  ...over,
});

function mount(send: Send, info = infoOf(), questionIndex = 0) {
  return renderHook(({ info: now }) => useMemory(now, questionIndex, send), { initialProps: { info } });
}

const answering = (result: SendResult) => vi.fn<Send>(() => Promise.resolve(result));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useMemory', () => {
  it('a flip sends the round-local number', () => {
    const send = answering({ ok: true });
    const hook = mount(send);
    act(() => hook.result.current.flip(5));
    expect(send).toHaveBeenCalledWith('player:memory', { questionIndex: 0, cell: 5 });
    expect(hook.result.current.cells[5]).toBe('pending');
    // поки картка летить, другої не відкрити
    expect(hook.result.current.canFlip).toBe(false);
    act(() => hook.result.current.flip(6));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a later round-local number goes as it is', () => {
    const send = answering({ ok: true });
    const hook = mount(send, infoOf(), 3);
    act(() => hook.result.current.flip(0));
    expect(send).toHaveBeenCalledWith('player:memory', { questionIndex: 3, cell: 0 });
  });

  it('the view replaces pending with the card', async () => {
    const send = answering({ ok: true });
    const hook = mount(send);
    await act(async () => hook.result.current.flip(5));
    expect(hook.result.current.cells[5]).toBe('pending');
    const cells = closed();
    cells[5] = card('Київ', 'open');
    hook.rerender({ info: infoOf({ cells, seq: 1 }) });
    expect(hook.result.current.cells[5]).toEqual(card('Київ', 'open'));
    expect(hook.result.current.canFlip).toBe(true);
  });

  it('a refused flip drops pending', async () => {
    for (const error of ['memory_busy', 'memory_wait', 'memory_open', 'memory_matched', 'too_soon']) {
      const send = answering({ ok: false, error });
      const hook = mount(send);
      await act(async () => hook.result.current.flip(5));
      expect(hook.result.current.cells[5]).toBeNull();
      expect(hook.result.current.canFlip).toBe(true);
      expect(hook.result.current.offline).toBe(false);
      hook.unmount();
    }
  });

  it('a lost ack drops pending and says offline', async () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>(() => new Promise<SendResult>(() => undefined));
    const hook = mount(send);
    act(() => hook.result.current.flip(2));
    expect(hook.result.current.cells[2]).toBe('pending');
    await act(async () => vi.advanceTimersByTime(MEMORY_ACK_MS));
    expect(hook.result.current.cells[2]).toBeNull();
    expect(hook.result.current.offline).toBe(true);
  });

  it('a wrong pair closes locally after closesInMs', () => {
    vi.useFakeTimers();
    const send = answering({ ok: true });
    const cells = closed();
    cells[1] = card('Київ', 'shown');
    cells[7] = card('Франція', 'shown');
    const hook = mount(send, infoOf({ cells, canFlip: false, closesInMs: 1000, moves: 1, seq: 2 }));
    expect(hook.result.current.cells[1]).toEqual(card('Київ', 'shown'));
    expect(hook.result.current.canFlip).toBe(false);
    act(() => hook.result.current.flip(3));
    expect(send).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(999));
    expect(hook.result.current.cells[7]).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(hook.result.current.cells[1]).toBeNull();
    expect(hook.result.current.cells[7]).toBeNull();
    expect(hook.result.current.canFlip).toBe(true);
    act(() => hook.result.current.flip(1));
    expect(send).toHaveBeenCalledWith('player:memory', { questionIndex: 0, cell: 1 });
  });

  it('a wrong pair stays closed while a teammate moves', () => {
    vi.useFakeTimers();
    const cells = closed();
    cells[1] = card('Київ', 'shown');
    cells[7] = card('Франція', 'shown');
    const hook = mount(answering({ ok: true }), infoOf({ cells, canFlip: false, closesInMs: 1000, busy: { nickname: 'Оля', tone: '2' } }));
    act(() => vi.advanceTimersByTime(1000));
    expect(hook.result.current.cells[1]).toBeNull();
    expect(hook.result.current.canFlip).toBe(false);
  });

  it('taps on matched or shown cards send nothing', () => {
    const send = answering({ ok: true });
    const cells = closed();
    cells[0] = card('Київ', 'matched');
    cells[4] = card('Україна', 'matched');
    cells[2] = card('Варшава', 'open');
    const hook = mount(send, infoOf({ cells, pairs: 1 }));
    act(() => hook.result.current.flip(0));
    act(() => hook.result.current.flip(4));
    act(() => hook.result.current.flip(2));
    expect(send).not.toHaveBeenCalled();
    const shown = closed();
    shown[1] = card('Київ', 'shown');
    shown[7] = card('Франція', 'shown');
    hook.rerender({ info: infoOf({ cells: shown, closesInMs: 1000, canFlip: false }) });
    act(() => hook.result.current.flip(1));
    expect(send).not.toHaveBeenCalled();
  });

  it('all found takes no flips', () => {
    const send = answering({ ok: true });
    const hook = mount(send, infoOf({ done: true, canFlip: false, pairs: 6, timeMs: 30_000 }));
    expect(hook.result.current.canFlip).toBe(false);
    act(() => hook.result.current.flip(0));
    expect(send).not.toHaveBeenCalled();
  });
});
