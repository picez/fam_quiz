import { afterEach, describe, expect, it } from 'vitest';
import { dayHeading, dayKey, isoToLocalInput, localInputToIso, timeText } from './calendar-time';
import { activateLocaleForTests } from '../i18n';

const KYIV = 'Europe/Kyiv';

describe('calendar-time', () => {
  it('groups by the viewer day in the zone, across the autumn change', () => {
    expect(dayKey('2026-10-24T21:30:00.000Z', KYIV)).toBe('2026-10-25');
    expect(timeText('2026-10-24T21:30:00.000Z', KYIV)).toBe('00:30');
    expect(dayKey('2026-10-25T22:30:00.000Z', KYIV)).toBe('2026-10-26');
    expect(timeText('2026-10-25T22:30:00.000Z', KYIV)).toBe('00:30');
  });

  it('uses the viewer zone, not Kyiv', () => {
    expect(dayKey('2026-11-07T22:30:00.000Z', 'America/New_York')).toBe('2026-11-07');
    expect(dayKey('2026-11-07T22:30:00.000Z', KYIV)).toBe('2026-11-08');
  });

  it('turns a local input into UTC by the zone', () => {
    expect(localInputToIso('2026-11-07T19:00', KYIV)).toBe('2026-11-07T17:00:00.000Z');
    expect(localInputToIso('2026-07-07T19:00', KYIV)).toBe('2026-07-07T16:00:00.000Z');
  });

  it('handles the daylight saving changes', () => {
    expect(localInputToIso('2026-10-25T03:30', KYIV)).toBe('2026-10-25T01:30:00.000Z');
    expect(localInputToIso('2026-03-29T03:30', KYIV)).toBe('2026-03-29T01:30:00.000Z');
  });

  it('rejects junk', () => {
    expect(localInputToIso('сміття', KYIV)).toBeNull();
    expect(localInputToIso('2026-13-45T99:99', KYIV)).toBeNull();
  });

  it('writes the value of a datetime-local input', () => {
    expect(isoToLocalInput('2026-11-07T17:00:00.000Z', KYIV)).toBe('2026-11-07T19:00');
  });

  it('writes the day heading, with the year only when it is not the current one', () => {
    const now = new Date('2026-11-02T10:00:00Z');
    expect(dayHeading('2026-11-07T17:00:00.000Z', KYIV, now)).toBe('субота, 7 листопада');
    expect(dayHeading('2026-11-07T17:00:00.000Z', KYIV, new Date('2025-11-02T10:00:00Z'))).toContain('2026');
  });
});

describe('dayHeading in the interface locale', () => {
  afterEach(() => activateLocaleForTests('uk'));
  const now = new Date('2026-11-01T00:00:00Z');

  it('takes the locale from the parameter or the active one', () => {
    expect(dayHeading('2026-11-07T17:00:00Z', KYIV, now, 'en')).toBe('Saturday 7 November');
    activateLocaleForTests('de', { ui: {} });
    expect(dayHeading('2026-11-07T17:00:00Z', KYIV, now)).toBe('Samstag, 7. November');
  });

  it('ar uses Western digits', () => {
    const text = dayHeading('2026-11-07T17:00:00Z', 'Europe/Kyiv', now, 'ar');
    expect(text).toMatch(/2026|7/);
    expect(text).not.toMatch(/[٠-٩]/);
  });
});
