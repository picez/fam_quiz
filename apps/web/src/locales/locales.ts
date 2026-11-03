import type { Locale } from '@quiz/shared';

/**
 * Мови, які бачать люди: перемикач, мова браузера й мова з профілю беруться лише звідси.
 * Мову вмикають, щойно її словник повний (`checks.test.ts` зелений): дописати її сюди — і все.
 * uk завжди перша.
 */
export const ENABLED_LOCALES: readonly Locale[] = ['uk', 'en'];

/** Самоназви мов для перемикача — без перекладу. */
export const LOCALE_NAMES: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  ar: 'العربية',
};

/** Теги для Intl: en-GB — 24-годинний час і день перед місяцем; ar — західні цифри. */
export const INTL_TAGS: Record<Locale, string> = {
  uk: 'uk-UA',
  en: 'en-GB',
  pl: 'pl-PL',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  ar: 'ar-u-nu-latn',
};

export function isEnabled(locale: Locale): boolean {
  return ENABLED_LOCALES.includes(locale);
}
