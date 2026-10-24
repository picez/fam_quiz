import { describe, expect, it } from 'vitest';
import { wipeoutStandings } from './index';

describe('wipeoutStandings (10g)', () => {
  const ids = ['p1', 'p2', 'p3'];
  it('everyone starts in with an empty bank', () => {
    const empty = { status: 'in', bank: 0, step: null };
    expect(wipeoutStandings(ids, [], false)).toEqual({ p1: empty, p2: empty, p3: empty });
  });
  it('a right answer adds the price, a wrong or missing one burns the bank', () => {
    const steps = [{ price: 100, correct: ['p1', 'p2'], took: [] }, { price: 200, correct: ['p2'], took: [] }];
    expect(wipeoutStandings(ids, steps, false)).toEqual({
      p1: { status: 'burned', bank: 0, step: 1 },
      p2: { status: 'in', bank: 300, step: null },
      p3: { status: 'burned', bank: 0, step: 0 },
    });
  });
  it('taking moves the bank out of the game; a later step does not touch it', () => {
    const steps = [
      { price: 100, correct: ['p1', 'p2'], took: [] },
      { price: 200, correct: ['p1', 'p2'], took: ['p2'] },
      { price: 300, correct: ['p2'], took: [] },
    ];
    const result = wipeoutStandings(ids, steps, false);
    expect(result.p2).toEqual({ status: 'took', bank: 300, step: 1 });
    expect(result.p1).toEqual({ status: 'burned', bank: 0, step: 2 });
  });
  it('over: whoever is still in survives on the last step', () => {
    const steps = [{ price: 100, correct: ['p2'], took: [] }, { price: 200, correct: ['p2'], took: [] }];
    const result = wipeoutStandings(ids, steps, true);
    expect(result.p2).toEqual({ status: 'survived', bank: 300, step: 1 });
    expect(result.p1.status).toBe('burned');
  });
  it('a burned player in took stays burned', () => {
    const result = wipeoutStandings(ids, [{ price: 100, correct: ['p1'], took: ['p1', 'p2'] }], false);
    expect(result.p2).toEqual({ status: 'burned', bank: 0, step: 0 });
    expect(result.p1).toEqual({ status: 'took', bank: 100, step: 0 });
  });
});
