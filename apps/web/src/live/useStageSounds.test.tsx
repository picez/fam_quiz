// @vitest-environment jsdom
import type { StageView } from '@quiz/shared';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStageSounds } from '../storage';
import { playStageSound } from '../stage-sound';
import { unlockAudio } from '../audio';
import { TICK_POLL_MS, useStageSounds } from './useStageSounds';

const audio = vi.hoisted(() => ({ ready: true, listeners: new Set<() => void>() }));

vi.mock('../stage-sound', () => ({ playStageSound: vi.fn(() => true) }));
vi.mock('../audio', () => ({
  audioSupported: () => true,
  audioReady: () => audio.ready,
  subscribeAudio: (listener: () => void) => {
    audio.listeners.add(listener);
    return () => audio.listeners.delete(listener);
  },
  unlockAudio: vi.fn(),
}));

const play = vi.mocked(playStageSound);

const view = (over: Record<string, unknown> = {}): StageView =>
  ({
    phase: 'question',
    paused: false,
    round: { index: 0 },
    questionIndex: 1,
    endsAt: null,
    remainingMs: null,
    held: false,
    splash: null,
    stats: null,
    ...over,
  }) as unknown as StageView;

const reveal = (accepted: number, over: Record<string, unknown> = {}) => view({ phase: 'reveal', stats: { answered: 2, accepted, counts: {} }, ...over });

const mount = (first: StageView) => renderHook(({ v }: { v: StageView }) => useStageSounds(v, 0), { initialProps: { v: first } });

const setReady = (ready: boolean) =>
  act(() => {
    audio.ready = ready;
    for (const listener of audio.listeners) listener();
  });

beforeEach(() => {
  localStorage.clear();
  audio.ready = true;
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  play.mockClear();
  vi.mocked(unlockAudio).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useStageSounds (40)', () => {
  it('polls ten times a second', () => {
    expect(TICK_POLL_MS).toBe(100);
  });

  it('the first view is only remembered', () => {
    const { rerender } = mount(reveal(1));
    expect(play).not.toHaveBeenCalled();
    rerender({ v: reveal(1) });
    expect(play).not.toHaveBeenCalled();
  });

  it('a new reveal plays once', () => {
    const { rerender } = mount(view({ endsAt: Date.now() + 20_000 }));
    rerender({ v: reveal(1) });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('correct');
    for (let i = 0; i < 3; i++) rerender({ v: reveal(1) });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('five ticks and one gong', () => {
    const endsAt = Date.now() + 7000;
    const { rerender } = mount(view({ endsAt }));
    act(() => vi.advanceTimersByTime(8000));
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'gong']);
    rerender({ v: view({ phase: 'locked', endsAt }) });
    act(() => vi.advanceTimersByTime(2000));
    expect(play).toHaveBeenCalledTimes(6);
  });

  it('a mount mid-countdown ticks from the next second', () => {
    mount(view({ endsAt: Date.now() + 3000 }));
    act(() => vi.advanceTimersByTime(3500));
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(['tick', 'tick', 'gong']);
  });

  it('a lock just before zero still gongs once', () => {
    const endsAt = Date.now() + 2000;
    const { rerender } = mount(view({ endsAt }));
    act(() => vi.advanceTimersByTime(1500));
    play.mockClear();
    rerender({ v: view({ phase: 'locked', endsAt }) });
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(['gong']);
    rerender({ v: reveal(0) });
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(['gong', 'wrong']);
  });

  const sounds = () => play.mock.calls.map(([sound]) => sound);
  const countdown = ['tick', 'tick', 'tick', 'tick', 'tick', 'gong'];

  it('a bluff-like question gongs at the end of each stage', () => {
    const { rerender } = mount(view({ endsAt: Date.now() + 7000 }));
    act(() => vi.advanceTimersByTime(7000));
    expect(sounds()).toEqual(countdown);
    const endsAt = Date.now() + 6000;
    rerender({ v: view({ endsAt }) });
    act(() => vi.advanceTimersByTime(6500));
    rerender({ v: view({ phase: 'locked', endsAt }) });
    rerender({ v: reveal(1) });
    expect(sounds()).toEqual([...countdown, ...countdown, 'correct']);
  });

  it('a spy-like question gongs at the end of each of three stages', () => {
    const { rerender } = mount(view({ endsAt: Date.now() + 6000 }));
    act(() => vi.advanceTimersByTime(6000));
    for (let stage = 0; stage < 2; stage++) {
      rerender({ v: view({ endsAt: Date.now() + 6000 }) });
      act(() => vi.advanceTimersByTime(6000));
    }
    rerender({ v: view({ phase: 'locked' }) });
    act(() => vi.advanceTimersByTime(2000));
    expect(sounds()).toEqual([...countdown, ...countdown, ...countdown]);
  });

  it('a fast hop after a stage timeout still gongs once', () => {
    const { rerender } = mount(view({ endsAt: Date.now() + 7000 }));
    act(() => vi.advanceTimersByTime(7000));
    const endsAt = Date.now() + 6000;
    rerender({ v: view({ endsAt }) });
    act(() => vi.advanceTimersByTime(5500));
    rerender({ v: view({ phase: 'locked', endsAt }) });
    rerender({ v: reveal(0) });
    expect(sounds()).toEqual([...countdown, ...countdown, 'wrong']);
  });

  it('a pause and a resume tick by the new timer, one gong', () => {
    const { rerender } = mount(view({ endsAt: Date.now() + 10_000 }));
    act(() => vi.advanceTimersByTime(6500));
    expect(sounds()).toEqual(['tick', 'tick']);
    rerender({ v: view({ paused: true, endsAt: null, remainingMs: 3500 }) });
    act(() => vi.advanceTimersByTime(10_000));
    expect(sounds()).toEqual(['tick', 'tick']);
    rerender({ v: view({ endsAt: Date.now() + 3500 }) });
    act(() => vi.advanceTimersByTime(4000));
    // Відновлення на 3,5 с: таймер показує 4 — цокання 4, 3, 2, 1 і гонг за новим endsAt.
    expect(sounds()).toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'tick', 'gong']);
  });

  it('+15 s mid-countdown: no gong at the old end, honest ticks and one gong at the new one', () => {
    const start = Date.now();
    const { rerender } = mount(view({ endsAt: start + 7000 }));
    act(() => vi.advanceTimersByTime(3500));
    expect(sounds()).toEqual(['tick', 'tick']);
    rerender({ v: view({ endsAt: start + 22_000 }) });
    act(() => vi.advanceTimersByTime(20_000));
    expect(sounds()).toEqual(['tick', 'tick', ...countdown]);
  });

  it('an early lock has no gong', () => {
    const endsAt = Date.now() + 20_000;
    const { rerender } = mount(view({ endsAt }));
    act(() => vi.advanceTimersByTime(8000));
    rerender({ v: view({ phase: 'locked', endsAt }) });
    act(() => vi.advanceTimersByTime(15_000));
    expect(play).not.toHaveBeenCalled();
  });

  it('muted events are not replayed — host switch', () => {
    const { rerender } = mount(view());
    rerender({ v: reveal(1, { soundsOff: true }) });
    rerender({ v: reveal(1) });
    expect(play).not.toHaveBeenCalled();
    rerender({ v: reveal(1, { questionIndex: 2 }) });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('muted events are not replayed — device switch', () => {
    saveStageSounds(false);
    const { result, rerender } = mount(view());
    rerender({ v: reveal(1) });
    act(() => result.current.toggle());
    rerender({ v: reveal(1) });
    expect(play).not.toHaveBeenCalled();
    rerender({ v: reveal(1, { questionIndex: 2 }) });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('muted events are not replayed — audio locked', () => {
    audio.ready = false;
    const { result, rerender } = mount(view());
    rerender({ v: reveal(1) });
    expect(result.current.ready).toBe(false);
    setReady(true);
    expect(result.current.ready).toBe(true);
    rerender({ v: reveal(1) });
    expect(play).not.toHaveBeenCalled();
    rerender({ v: reveal(1, { questionIndex: 2 }) });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('accents and the fanfare', () => {
    const { rerender } = mount(view());
    rerender({ v: view({ phase: 'lobby', splash: { kind: 'round', at: Date.now(), until: Date.now() + 3500 } }) });
    rerender({ v: view({ phase: 'finished', splash: { kind: 'podium', at: Date.now(), until: Date.now() + 2500 } }) });
    rerender({ v: view({ phase: 'finished' }) });
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(['accent', 'fanfare']);
  });

  it('the control', () => {
    const { result, rerender } = mount(view({ soundsOff: true }));
    expect(result.current.supported).toBe(true);
    expect(result.current.hostOn).toBe(false);
    rerender({ v: view() });
    expect(result.current.hostOn).toBe(true);
    expect(result.current.device).toBe(true);
    expect(result.current.ready).toBe(true);
    act(() => result.current.toggle());
    expect(localStorage.getItem('quiz:stage-sounds')).toBe('off');
    expect(result.current.device).toBe(false);
    expect(unlockAudio).not.toHaveBeenCalled();
    act(() => result.current.toggle());
    expect(localStorage.getItem('quiz:stage-sounds')).toBeNull();
    expect(result.current.device).toBe(true);
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    act(() => result.current.unlock());
    expect(unlockAudio).toHaveBeenCalledTimes(2);
  });

  it('stops polling on unmount', () => {
    const { unmount } = mount(view({ endsAt: Date.now() + 7000 }));
    unmount();
    act(() => vi.advanceTimersByTime(8000));
    expect(play).not.toHaveBeenCalled();
  });
});
