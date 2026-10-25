import { describe, expect, it } from 'vitest';
import { CELL_SURPRISE_MS, SPLASH_MS } from './index';

describe('splash durations (11b)', () => {
  it('transition splashes are longer; surprise, podium and trial are unchanged', () => {
    expect(SPLASH_MS).toEqual({ round: 3500, final: 4000, question: 1800, cell: 1500, duel: 2500, podium: 2500, trial: 2200 });
    expect(CELL_SURPRISE_MS).toBe(800);
  });
});
