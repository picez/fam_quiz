// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { paceAttrs, paceProgress, usePace } from './pace';

const w = { from: 1000, until: 3000 };

describe('paceProgress', () => {
  it('is null without a window', () => {
    expect(paceProgress(null, 0)).toBeNull();
  });

  it('is 0 before and at the start of the window', () => {
    expect(paceProgress(w, 500)).toBe(0);
    expect(paceProgress(w, 1000)).toBe(0);
  });

  it('fills towards the end plus the margin', () => {
    expect(paceProgress(w, 2050)).toBeCloseTo(0.5, 5);
    const late = paceProgress(w, 3099);
    expect(late).not.toBeNull();
    expect(late as number).toBeLessThan(1);
  });

  it('is null once the window and the margin are over', () => {
    expect(paceProgress(w, 3100)).toBeNull();
  });
});

describe('paceAttrs', () => {
  it('a waiting button gets the fill, the hint and aria-busy; a free one nothing', () => {
    expect(paceAttrs(0.5)).toEqual({ style: { '--pace': 0.5 }, title: 'Ще мить: гравці мають побачити екран.', 'aria-busy': true });
    expect(paceAttrs(null)).toEqual({});
  });
});

describe('usePace', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('redraws while the window runs and clears its timer afterwards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { result } = renderHook(() => usePace(w, 0));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1050);
    });
    expect(result.current).toBeCloseTo(0.5, 1);
    act(() => {
      vi.advanceTimersByTime(1050);
    });
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { unmount } = renderHook(() => usePace(w, 0));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
