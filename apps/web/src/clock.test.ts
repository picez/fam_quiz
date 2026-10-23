import { describe, expect, it } from 'vitest';
import { secondsLeft, splashLeft } from './clock';

const open = { endsAt: 1_020_000, remainingMs: null };

describe('secondsLeft', () => {
  it('is null when no question is running', () => {
    expect(secondsLeft({ endsAt: null, remainingMs: null }, 0, 1_000_000)).toBeNull();
  });

  it('counts whole seconds up to the deadline, rounding up', () => {
    expect(secondsLeft(open, 0, 1_000_000)).toBe(20);
    expect(secondsLeft(open, 0, 1_000_001)).toBe(20);
    expect(secondsLeft(open, 0, 1_019_001)).toBe(1);
    expect(secondsLeft(open, 0, 1_020_000)).toBe(0);
  });

  it('never goes below zero', () => {
    expect(secondsLeft(open, 0, 1_090_000)).toBe(0);
  });

  it('corrects a device clock that runs behind or ahead of the server', () => {
    // Годинник пристрою відстає на 30 с: offset = serverNow - deviceNow = +30 000.
    expect(secondsLeft(open, 30_000, 970_000)).toBe(20);
    // Годинник пристрою поспішає на 30 с.
    expect(secondsLeft(open, -30_000, 1_030_000)).toBe(20);
  });

  it('shows the frozen remaining time while paused', () => {
    expect(secondsLeft({ endsAt: null, remainingMs: 14_200 }, 0, 5)).toBe(15);
  });
});

describe('splashLeft', () => {
  it('counts the splash milliseconds left by the server clock', () => {
    expect(splashLeft({ until: 10_000 }, 0, 9_000)).toBe(1000);
    expect(splashLeft({ until: 10_000 }, 500, 9_000)).toBe(500);
    expect(splashLeft({ until: 10_000 }, 0, 12_000)).toBe(0);
  });
});
