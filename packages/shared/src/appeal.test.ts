import { describe, expect, it } from 'vitest';
import { APPEAL_MS, APPEALS_PER_GAME, appealCounted, appealDecision } from './appeal';

describe('appeal basics (12f)', () => {
  it('a simple majority of the voters decides; a tie and no votes keep the result', () => {
    expect(appealDecision(2, 0)).toBe('yes');
    expect(appealDecision(2, 1)).toBe('yes');
    expect(appealDecision(1, 2)).toBe('no');
    expect(appealDecision(1, 1)).toBe('tie');
    expect(appealDecision(0, 0)).toBe('tie');
  });
  it('an open appeal and every hall decision count toward the limit; the host and the end do not', () => {
    expect([null, 'yes', 'no', 'tie'].map((o) => appealCounted(o as never))).toEqual([true, true, true, true]);
    expect(appealCounted('host')).toBe(false);
    expect(appealCounted('cancelled')).toBe(false);
    expect([APPEAL_MS.vote, APPEALS_PER_GAME]).toEqual([30_000, 2]);
  });
});
