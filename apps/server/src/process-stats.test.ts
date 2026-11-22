import type { ELDHistogram } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processStats } from './process-stats';

/** Підроблена гістограма: числа в наносекундах, reset — лічимо. */
function fakeHistogram(values: { p50: number; p99: number; max: number }) {
  const state = { ...values, resets: 0, enabled: 0, disabled: 0 };
  const histogram = {
    percentile: (p: number) => (p === 50 ? state.p50 : state.p99),
    get max() {
      return state.max;
    },
    reset: () => {
      state.resets += 1;
    },
    enable: () => {
      state.enabled += 1;
      return true;
    },
    disable: () => {
      state.disabled += 1;
      return true;
    },
  } as unknown as ELDHistogram;
  return { histogram, state };
}

describe('processStats (71)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is empty before the first minute, then a CPU share and the event-loop delay of that minute', () => {
    let clock = 1_000_000;
    let cpu = { user: 0, system: 0 };
    const { histogram, state } = fakeHistogram({ p50: 10_400_000, p99: 25_160_000, max: 80_000_000 });
    const stats = processStats({ cpuUsage: () => cpu, histogram, now: () => clock, intervalMs: 60_000 });
    expect(state.enabled).toBe(1);
    expect(stats.snapshot()).toEqual({ cpuPercent: null, lagMs: null });

    clock += 60_000;
    // 15 с одного ядра за хвилину = 25 %.
    cpu = { user: 12_000_000, system: 3_000_000 };
    vi.advanceTimersByTime(60_000);
    expect(stats.snapshot()).toEqual({ cpuPercent: 25, lagMs: { p50: 10.4, p99: 25.2, max: 80 } });
    expect(state.resets).toBe(1);

    clock += 30_000;
    cpu = { user: 13_000_000, system: 3_100_000 };
    state.p50 = 1_000_000;
    state.p99 = 2_000_000;
    state.max = 3_000_000;
    vi.advanceTimersByTime(60_000);
    // 1.1 с за 30 с = 3.7 %.
    expect(stats.snapshot()).toEqual({ cpuPercent: 3.7, lagMs: { p50: 1, p99: 2, max: 3 } });
    expect(state.resets).toBe(2);
    stats.stop();
  });

  it('stop clears the timer and turns the histogram off; the timer does not hold the process', () => {
    const { histogram, state } = fakeHistogram({ p50: 0, p99: 0, max: 0 });
    const unref = vi.fn();
    const setter = vi.spyOn(globalThis, 'setInterval').mockImplementation((() => ({ unref })) as unknown as typeof setInterval);
    const clearer = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    const stats = processStats({ cpuUsage: () => ({ user: 0, system: 0 }), histogram, now: () => 0 });
    expect(unref).toHaveBeenCalled();
    stats.stop();
    expect(clearer).toHaveBeenCalled();
    expect(state.disabled).toBe(1);
    setter.mockRestore();
    clearer.mockRestore();
  });

  it('works with the real process numbers', () => {
    vi.useRealTimers();
    const stats = processStats();
    expect(stats.snapshot()).toEqual({ cpuPercent: null, lagMs: null });
    stats.stop();
  });
});
