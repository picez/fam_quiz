// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPOTDIFF_FREEZE_MS, type PlayerSpotdiff } from '@quiz/shared';
import type { Send, SendResult } from './types';
import { SPOTDIFF_CROSS_MS, useSpotdiff } from './useSpotdiff';

const infoOf = (over: Partial<PlayerSpotdiff> = {}): PlayerSpotdiff => ({ found: [], total: 5, done: false, canTap: true, seq: 0, timeMs: null, result: null, ...over });

function mount(send: Send, info = infoOf(), questionIndex = 0) {
  return renderHook(({ info: now }) => useSpotdiff(now, questionIndex, send), { initialProps: { info } });
}

const answering = (result: SendResult) => vi.fn<Send>(() => Promise.resolve(result));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSpotdiff', () => {
  it('a tap sends the round-local number and the width', () => {
    const send = answering({ ok: true });
    const hook = mount(send);
    act(() => hook.result.current.tap(0.5, 0.4, 288));
    expect(send).toHaveBeenCalledWith('player:spotdiff', { questionIndex: 0, x: 0.5, y: 0.4, width: 288 });
  });

  it('a later round-local number goes as it is', () => {
    const send = answering({ ok: true });
    const hook = mount(send, infoOf(), 3);
    act(() => hook.result.current.tap(0.1, 0.2, 400));
    expect(send).toHaveBeenCalledWith('player:spotdiff', { questionIndex: 3, x: 0.1, y: 0.2, width: 400 });
  });

  it('a tiny width is raised to the minimum', () => {
    const send = answering({ ok: true });
    const hook = mount(send);
    act(() => hook.result.current.tap(0.5, 0.4, 150));
    expect(send).toHaveBeenCalledWith('player:spotdiff', { questionIndex: 0, x: 0.5, y: 0.4, width: 150 });
    act(() => hook.result.current.tap(0.5, 0.4, 40));
    expect(send).toHaveBeenLastCalledWith('player:spotdiff', { questionIndex: 0, x: 0.5, y: 0.4, width: 60 });
    act(() => hook.result.current.tap(0.5, 0.4, 9000));
    expect(send).toHaveBeenLastCalledWith('player:spotdiff', { questionIndex: 0, x: 0.5, y: 0.4, width: 4000 });
  });

  it('a freeze blocks taps for a second', async () => {
    vi.useFakeTimers();
    const send = answering({ ok: false, error: 'spotdiff_freeze' });
    const hook = mount(send);
    await act(async () => hook.result.current.tap(0.5, 0.4, 288));
    expect(hook.result.current.frozen).toBe(true);
    act(() => hook.result.current.tap(0.2, 0.2, 288));
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(SPOTDIFF_FREEZE_MS));
    expect(hook.result.current.frozen).toBe(false);
    await act(async () => hook.result.current.tap(0.2, 0.2, 288));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a frozen answer freezes too, a found one shows nothing', async () => {
    vi.useFakeTimers();
    const found = mount(answering({ ok: false, error: 'spotdiff_found' }));
    await act(async () => found.result.current.tap(0.5, 0.4, 288));
    expect(found.result.current.frozen).toBe(false);
    expect(found.result.current.misses).toEqual([]);
    cleanup();
    const frozen = mount(answering({ ok: false, error: 'spotdiff_frozen' }));
    await act(async () => frozen.result.current.tap(0.5, 0.4, 288));
    expect(frozen.result.current.frozen).toBe(true);
    expect(frozen.result.current.misses).toEqual([]);
  });

  it('late frozen answers do not stretch a running freeze', async () => {
    vi.useFakeTimers();
    const pending: ((result: SendResult) => void)[] = [];
    const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => pending.push(resolve)));
    const hook = mount(send);
    // три тапи летять разом: перший заморожує, решта приходять пізніше з spotdiff_frozen
    act(() => {
      hook.result.current.tap(0.1, 0.1, 288);
      hook.result.current.tap(0.2, 0.2, 288);
      hook.result.current.tap(0.3, 0.3, 288);
    });
    await act(async () => pending[0]({ ok: false, error: 'spotdiff_freeze' }));
    expect(hook.result.current.frozen).toBe(true);
    act(() => vi.advanceTimersByTime(600));
    await act(async () => pending[1]({ ok: false, error: 'spotdiff_frozen' }));
    act(() => vi.advanceTimersByTime(300));
    await act(async () => pending[2]({ ok: false, error: 'spotdiff_frozen' }));
    expect(hook.result.current.frozen).toBe(true);
    act(() => vi.advanceTimersByTime(SPOTDIFF_FREEZE_MS - 900));
    expect(hook.result.current.frozen).toBe(false);
  });

  it('a miss shows a cross that fades', async () => {
    vi.useFakeTimers();
    const hook = mount(answering({ ok: false, error: 'spotdiff_miss' }));
    await act(async () => hook.result.current.tap(0.5, 0.4, 288));
    expect(hook.result.current.misses).toHaveLength(1);
    expect(hook.result.current.misses[0]).toMatchObject({ x: 0.5, y: 0.4 });
    expect(hook.result.current.frozen).toBe(false);
    act(() => vi.advanceTimersByTime(SPOTDIFF_CROSS_MS));
    expect(hook.result.current.misses).toEqual([]);
  });

  it('too_soon is dropped silently', async () => {
    const hook = mount(answering({ ok: false, error: 'too_soon' }));
    await act(async () => hook.result.current.tap(0.5, 0.4, 288));
    expect(hook.result.current.misses).toEqual([]);
    expect(hook.result.current.frozen).toBe(false);
    expect(hook.result.current.offline).toBe(false);
  });

  it('a lost ack says offline until the next answer', async () => {
    let fail = true;
    const send = vi.fn<Send>(() => (fail ? Promise.reject(new Error('gone')) : Promise.resolve<SendResult>({ ok: true })));
    const hook = mount(send);
    await act(async () => hook.result.current.tap(0.5, 0.4, 288));
    expect(hook.result.current.offline).toBe(true);
    fail = false;
    await act(async () => hook.result.current.tap(0.5, 0.4, 288));
    expect(hook.result.current.offline).toBe(false);
  });

  it('no taps when the board is done or closed', () => {
    const send = answering({ ok: true });
    const hook = mount(send, infoOf({ done: true }));
    act(() => hook.result.current.tap(0.5, 0.4, 288));
    hook.rerender({ info: infoOf({ canTap: false }) });
    act(() => hook.result.current.tap(0.5, 0.4, 288));
    expect(send).not.toHaveBeenCalled();
  });
});
