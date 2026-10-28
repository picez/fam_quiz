import { describe, expect, it } from 'vitest';
import { awayGapMs, awaySeconds, AWAY_MS, AWAY_REPORT_MAX_MS } from './away';
import { awaySchema } from './events';

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
  it('a phone that came back while offline: the hide ends at its return, not at the reconnect', () => {
    // Вихід 2000…6000 (за телефоном), розрив 4000…9000, звіт на 9000 через 3000 мс після повернення → лише 4000…6000.
    expect(awayGapMs({ dropAt: 4000, backAt: 9000 }, 4000, 9000 - 3000)).toBe(2000);
    // Повернувся ще до розриву — 0.
    expect(awayGapMs({ dropAt: 4000, backAt: 9000 }, 1000, 3000)).toBe(0);
  });
  it('a gap longer than the claim counts only the claim; a gap that began after the return counts nothing', () => {
    // Розрив 0…20000 довший за вихід 5000…8000 → лише 3000 (заявлене телефоном).
    expect(awayGapMs({ dropAt: 0, backAt: 20_000 }, 3000, 8000)).toBe(3000);
    // Розрив почався вже після повернення (8000) — 0.
    expect(awayGapMs({ dropAt: 9000, backAt: 12_000 }, 3000, 8000)).toBe(0);
    // Розрив почався посеред виходу й тягнеться після повернення — до повернення.
    expect(awayGapMs({ dropAt: 6000, backAt: 12_000 }, 3000, 8000)).toBe(2000);
  });
  it('the report: away, ms and sinceReturnMs are bounded whole numbers', () => {
    expect(awaySchema.safeParse({ away: true }).success).toBe(true);
    expect(awaySchema.safeParse({ away: false, ms: 4000, sinceReturnMs: 1500 }).success).toBe(true);
    expect(awaySchema.safeParse({ away: false, ms: 4000, sinceReturnMs: AWAY_REPORT_MAX_MS + 1 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, sinceReturnMs: -1 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, sinceReturnMs: 1.5 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, ms: AWAY_REPORT_MAX_MS + 1 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: 'x' }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, ms: -1 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, ms: 1.5 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, ms: 3_600_001 }).success).toBe(false);
    expect(awaySchema.safeParse({ away: false, ms: AWAY_REPORT_MAX_MS }).success).toBe(true);
    expect(awaySchema.safeParse({ away: false, ms: 0, sinceReturnMs: AWAY_REPORT_MAX_MS }).success).toBe(true);
    expect(AWAY_REPORT_MAX_MS).toBe(3_600_000);
  });
  it('whole seconds and the thresholds', () => {
    expect(awaySeconds(4999)).toBe(4);
    expect(AWAY_MS.mark).toBeLessThan(AWAY_MS.penalty);
  });
});
