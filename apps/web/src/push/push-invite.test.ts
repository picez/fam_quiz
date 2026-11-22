import { PUSH_INVITE_GAP_DAYS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { PUSH_INVITE_KEY, inviteDue, rememberInvite } from './push-invite';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const store = (value: string | null) => ({ getItem: (key: string) => (key === PUSH_INVITE_KEY ? value : null) });

describe('inviteDue', () => {
  it('the first time is due', () => expect(inviteDue(NOW, store(null))).toBe(true));
  it('13 days later is not, 14 days later is', () => {
    expect(PUSH_INVITE_GAP_DAYS).toBe(14);
    expect(inviteDue(NOW, store(String(NOW - 13 * DAY)))).toBe(false);
    expect(inviteDue(NOW, store(String(NOW - 14 * DAY)))).toBe(true);
  });
  it('garbage or a time in the future counts as never shown', () => {
    expect(inviteDue(NOW, store('oops'))).toBe(true);
    expect(inviteDue(NOW, store(String(NOW + DAY)))).toBe(true);
  });
  it('a throwing storage counts as due', () => {
    expect(inviteDue(NOW, { getItem: () => { throw new Error('no'); } })).toBe(true);
  });
});

describe('rememberInvite', () => {
  it('writes the time and survives a throwing storage', () => {
    let saved = '';
    rememberInvite(NOW, { setItem: (_key, value) => { saved = value; } });
    expect(saved).toBe(String(NOW));
    expect(() => rememberInvite(NOW, { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});
