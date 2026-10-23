import { describe, expect, it } from 'vitest';
import { splitBank } from './bank';

const e = (playerId: string, wager: number, correct: boolean) => ({ playerId, wager, correct });

describe('the shared bank', () => {
  it('splitBank gives the losers’ stakes to the winners by their stakes, the remainder to the biggest stake', () => {
    expect(splitBank([e('a', 1000, false), e('b', 400, true), e('c', 200, true)])).toEqual({
      bank: 1000,
      refund: false,
      points: { a: -1000, b: 667, c: 333 },
    });
  });

  it('splitBank breaks a tie between the biggest stakes by the join order', () => {
    expect(splitBank([e('a', 101, false), e('b', 300, true), e('c', 300, true)]).points).toEqual({ a: -101, b: 51, c: 50 });
  });

  it('splitBank gives nothing to a winner who staked zero', () => {
    expect(splitBank([e('a', 500, false), e('b', 0, true), e('c', 250, true)]).points).toEqual({ a: -500, b: 0, c: 500 });
  });

  it('splitBank returns the stakes when nobody is right or every winner staked zero', () => {
    expect(splitBank([e('a', 500, false), e('b', 200, false)])).toEqual({ bank: 700, refund: true, points: { a: 0, b: 0 } });
    expect(splitBank([e('a', 500, false), e('b', 0, true)])).toEqual({ bank: 500, refund: true, points: { a: 0, b: 0 } });
  });

  it('splitBank changes nothing when everyone is right or the losers staked zero', () => {
    expect(splitBank([e('a', 500, true), e('b', 200, true)])).toEqual({ bank: 0, refund: false, points: { a: 0, b: 0 } });
    expect(splitBank([e('a', 0, false), e('b', 200, true)])).toEqual({ bank: 0, refund: false, points: { a: 0, b: 0 } });
    expect(splitBank([])).toEqual({ bank: 0, refund: false, points: {} });
  });
});
