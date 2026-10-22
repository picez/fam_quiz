// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Spotlight } from '@quiz/shared';
import { BLINK_MS, useVerdictBlink } from './verdict-blink';

afterEach(() => {
  vi.useRealTimers();
});

const spot = (grade: Spotlight['grade'], playerId = 'p1'): Spotlight => ({
  playerId,
  nickname: 'Анна',
  answer: { type: 'single', optionId: 'a' },
  grade,
});

describe('useVerdictBlink', () => {
  it('blinks when a verdict arrives, not on the first render', () => {
    vi.useFakeTimers();
    const pending = spot(null),
      wrong = spot('wrong');
    const { result, rerender } = renderHook(({ s }: { s: Spotlight | null }) => useVerdictBlink(s), { initialProps: { s: wrong } });
    expect(result.current).toBe(false);
    rerender({ s: pending });
    expect(result.current).toBe(false);
    rerender({ s: wrong });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(BLINK_MS));
    expect(result.current).toBe(false);
  });

  it('a new verdict of another player blinks again; the same verdict on re-render does not', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ s }: { s: Spotlight | null }) => useVerdictBlink(s), { initialProps: { s: null as Spotlight | null } });
    rerender({ s: spot('wrong') });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(BLINK_MS));
    rerender({ s: { ...spot('wrong') } });
    expect(result.current).toBe(false);
    rerender({ s: spot('correct', 'p2') });
    expect(result.current).toBe(true);
    // Новий вердикт посеред миготіння запускає відлік спочатку.
    act(() => vi.advanceTimersByTime(BLINK_MS - 1000));
    rerender({ s: spot('wrong', 'p3') });
    act(() => vi.advanceTimersByTime(BLINK_MS - 1000));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('a voice verdict without a named option blinks too', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ s }: { s: Spotlight | null }) => useVerdictBlink(s), { initialProps: { s: null as Spotlight | null } });
    rerender({ s: { playerId: 'p1', nickname: 'Анна', answer: null, grade: 'correct' } });
    expect(result.current).toBe(true);
  });
});
