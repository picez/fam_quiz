// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlitzRow, Spotlight } from '@quiz/shared';
import { BLINK_MS, useBlinkingRows, useVerdictBlink } from './verdict-blink';

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

describe('useBlinkingRows', () => {
  const row = (playerId: string, grade: BlitzRow['grade']): BlitzRow => ({ playerId, nickname: playerId, timeMs: 1000, grade, answer: null });

  it('useBlinkingRows blinks a row whose verdict arrives, not on the first render, and not again for the next question with the same verdict', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ rows, scope }: { rows: BlitzRow[]; scope: number }) => useBlinkingRows(rows, scope), {
      initialProps: { rows: [row('p1', 'wrong')], scope: 1 },
    });
    expect([...result.current]).toEqual([]);
    rerender({ rows: [row('p1', 'wrong'), row('p2', 'correct')], scope: 1 });
    expect([...result.current]).toEqual(['p2']);
    act(() => vi.advanceTimersByTime(BLINK_MS));
    expect([...result.current]).toEqual([]);
    rerender({ rows: [], scope: 2 });
    expect([...result.current]).toEqual([]);
    rerender({ rows: [row('p1', null)], scope: 2 });
    expect([...result.current]).toEqual([]);
    rerender({ rows: [row('p1', 'wrong')], scope: 2 });
    expect([...result.current]).toEqual(['p1']);
  });
});
