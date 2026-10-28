import { describe, expect, it } from 'vitest';
import { APPEAL_MS, APPEALS_PER_GAME, appealCounted, appealDecision, type AppealOutcome } from './appeal';
import { appealSchema, appealVoteSchema } from './events';

describe('appeal basics (12f)', () => {
  it('a simple majority of the voters decides; a tie and no votes keep the result', () => {
    expect(appealDecision(2, 0)).toBe('yes');
    expect(appealDecision(2, 1)).toBe('yes');
    expect(appealDecision(1, 2)).toBe('no');
    expect(appealDecision(1, 1)).toBe('tie');
    expect(appealDecision(0, 0)).toBe('tie');
  });
  it('an open appeal and every hall decision count toward the limit; the host and the end do not', () => {
    const hall: (AppealOutcome | null)[] = [null, 'yes', 'no', 'tie'];
    expect(hall.map((o) => appealCounted(o))).toEqual([true, true, true, true]);
    expect(appealCounted('host')).toBe(false);
    expect(appealCounted('cancelled')).toBe(false);
    expect([APPEAL_MS.vote, APPEALS_PER_GAME]).toEqual([30_000, 2]);
  });
  it('the payloads: a known reason; a whole appeal id from 1 to 1 000 000 and a boolean yes', () => {
    expect(appealSchema.safeParse({ reason: 'grade' }).success).toBe(true);
    expect(appealSchema.safeParse({ reason: 'away' }).success).toBe(true);
    expect(appealSchema.safeParse({ reason: 'host' }).success).toBe(false);
    expect(appealVoteSchema.safeParse({ appealId: 1, yes: false }).success).toBe(true);
    expect(appealVoteSchema.safeParse({ appealId: 1_000_000, yes: true }).success).toBe(true);
    for (const appealId of [0, -1, 1.5, 1_000_001, '1']) expect(appealVoteSchema.safeParse({ appealId, yes: true }).success, String(appealId)).toBe(false);
    expect(appealVoteSchema.safeParse({ appealId: 1, yes: 'так' }).success).toBe(false);
  });
});
