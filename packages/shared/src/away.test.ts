import { describe, expect, it } from 'vitest';
import { awayGapMs, awaySeconds, AWAY_MS } from './away';

describe('away helpers (12e)', () => {
  it('counts only the part of the hide when the phone was offline', () => {
    // Вихід 10 с: 1000…11000; розрив 4000…9000 → 5000.
    expect(awayGapMs({ dropAt: 4000, backAt: 9000 }, 10_000, 11_000)).toBe(5000);
    // Розрив почався до виходу: перетин лише з виходом.
    expect(awayGapMs({ dropAt: 0, backAt: 9000 }, 3000, 11_000)).toBe(1000);
    // Розрив без виходу (телефон видно) — 0; немає розриву чи повернення — 0.
    expect(awayGapMs({ dropAt: 4000, backAt: 9000 }, 0, 11_000)).toBe(0);
    expect(awayGapMs(null, 10_000, 11_000)).toBe(0);
    expect(awayGapMs({ dropAt: 4000, backAt: null }, 10_000, 11_000)).toBe(0);
  });
  it('whole seconds and the thresholds', () => {
    expect(awaySeconds(4999)).toBe(4);
    expect(AWAY_MS.mark).toBeLessThan(AWAY_MS.penalty);
  });
});
