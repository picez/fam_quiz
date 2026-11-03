import { z } from 'zod';

/** Мови інтерфейсу: лише ці сім, у цьому порядку. Інших немає й не буде. */
export const LOCALES = ['uk', 'en', 'pl', 'de', 'es', 'it', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const localeSchema: z.ZodType<Locale> = z.enum(LOCALES);
export const localeUpdateSchema: z.ZodType<{ locale: Locale }> = z.object({ locale: z.enum(LOCALES) }).strict();

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}
