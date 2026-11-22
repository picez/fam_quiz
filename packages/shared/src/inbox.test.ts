import { describe, expect, it } from 'vitest';
import { INBOX_MAX, INBOX_POLL_MS, INBOX_QUOTE_MAX, PUSH_INVITE_GAP_DAYS, inboxReadSchema } from './inbox';

describe('inbox (70)', () => {
  it('the read mark takes an ISO time only', () => {
    expect(inboxReadSchema.parse({ upTo: '2026-11-22T10:00:00.000Z' })).toEqual({ upTo: '2026-11-22T10:00:00.000Z' });
    expect(inboxReadSchema.safeParse({ upTo: 'вчора' }).success).toBe(false);
    expect(inboxReadSchema.safeParse({}).success).toBe(false);
    expect(inboxReadSchema.safeParse({ upTo: '2026-11-22T10:00:00.000Z', all: true }).success).toBe(false);
  });

  it('limits', () => {
    expect(INBOX_MAX).toBe(50);
    expect(INBOX_POLL_MS).toBe(60_000);
    expect(INBOX_QUOTE_MAX).toBe(200);
    expect(PUSH_INVITE_GAP_DAYS).toBe(14);
  });
});
