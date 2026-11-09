import { describe, expect, it } from 'vitest';
import { blitzLeadMs, CELL_SURPRISE_MS, SPLASH_MS } from './index';

describe('splash durations (11b)', () => {
  it('transition splashes are longer; surprise, podium and trial are unchanged', () => {
    expect(SPLASH_MS).toEqual({ round: 3500, final: 4000, question: 1800, cell: 1500, duel: 2500, podium: 2500, trial: 2200, blitz: 3000 });
    expect(CELL_SURPRISE_MS).toBe(800);
  });
});

describe('blitz cell splash (26a)', () => {
  it('the lead is whatever precedes the 3 s «БЛІЦ!»; never negative', () => {
    expect(blitzLeadMs({ at: 1000, until: 1000 + SPLASH_MS.cell + SPLASH_MS.blitz })).toBe(SPLASH_MS.cell);
    expect(blitzLeadMs({ at: 1000, until: 1000 + SPLASH_MS.cell + CELL_SURPRISE_MS + SPLASH_MS.blitz })).toBe(SPLASH_MS.cell + CELL_SURPRISE_MS);
    expect(blitzLeadMs({ at: 1000, until: 1000 + SPLASH_MS.blitz })).toBe(0);
    expect(blitzLeadMs({ at: 1000, until: 1500 })).toBe(0);
  });
});
