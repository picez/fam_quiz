import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLocale, intlTag, setCurrentLocale, subscribeLocale } from './current';
import { ENABLED_LOCALES, INTL_TAGS, LOCALE_NAMES, isEnabled } from './locales';

describe('current locale', () => {
  afterEach(() => setCurrentLocale('uk'));

  it('starts in uk', () => {
    expect(currentLocale()).toBe('uk');
    expect(intlTag()).toBe('uk-UA');
  });

  it('maps locales to Intl tags with Western digits for Arabic', () => {
    expect(intlTag('ar')).toBe('ar-u-nu-latn');
    expect(intlTag('en')).toBe('en-GB');
    expect(INTL_TAGS).toEqual({ uk: 'uk-UA', en: 'en-GB', pl: 'pl-PL', de: 'de-DE', es: 'es-ES', it: 'it-IT', ar: 'ar-u-nu-latn' });
  });

  it('notifies a subscriber once per change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const stop = subscribeLocale(listener);
    setCurrentLocale('de');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(currentLocale()).toBe('de');
    expect(intlTag()).toBe('de-DE');
    stop();
    setCurrentLocale('uk');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('enabled locales', () => {
  it('starts with uk only', () => {
    expect(ENABLED_LOCALES).toEqual(['uk']);
    expect(isEnabled('uk')).toBe(true);
    expect(isEnabled('en')).toBe(false);
  });

  it('names every locale in itself', () => {
    expect(LOCALE_NAMES).toEqual({ uk: 'Українська', en: 'English', pl: 'Polski', de: 'Deutsch', es: 'Español', it: 'Italiano', ar: 'العربية' });
  });
});
