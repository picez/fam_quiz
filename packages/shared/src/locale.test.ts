import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, RTL_LOCALES, isLocale, isRtl, localeSchema, localeUpdateSchema } from './locale';
import { pushPayloadSchema } from './push';

describe('locale', () => {
  it('lists exactly the seven locales in order', () => {
    expect(LOCALES).toEqual(['uk', 'en', 'pl', 'de', 'es', 'it', 'ar']);
    expect(DEFAULT_LOCALE).toBe('uk');
    expect(RTL_LOCALES).toEqual(['ar']);
  });

  it('recognises locales', () => {
    expect(isLocale('ru')).toBe(false);
    expect(isLocale('de')).toBe(true);
    expect(isLocale(null)).toBe(false);
    expect(localeSchema.safeParse('UK').success).toBe(false);
  });

  it('knows right-to-left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('uk')).toBe(false);
  });

  it('is strict about the update body', () => {
    expect(localeUpdateSchema.safeParse({ locale: 'de' }).success).toBe(true);
    expect(localeUpdateSchema.safeParse({ locale: 'ru' }).success).toBe(false);
    expect(localeUpdateSchema.safeParse({ locale: 'de', x: 1 }).success).toBe(false);
  });

  it('lets push payloads name a locale', () => {
    const base = { kind: 'opened', eventId: 'e', title: 't', code: '123456' };
    expect(pushPayloadSchema.safeParse({ ...base, locale: 'pl' }).success).toBe(true);
    expect(pushPayloadSchema.safeParse(base).success).toBe(true);
    expect(pushPayloadSchema.safeParse({ ...base, locale: 'ru' }).success).toBe(false);
  });
});
