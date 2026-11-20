import { z } from 'zod';
import { UNSTORABLE, isStorable } from './text';

export const ANNOUNCEMENT_TEXT_MAX = 200;
export const ANNOUNCEMENT_URL_MAX = 500;
export const ANNOUNCEMENT_MAX_DAYS = 365;

/** 53: оголошення адміна на всіх сторінках, крім гри. Будь-яка зміна — новий id. */
export interface Announcement {
  id: string;
  text: string;
  url: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Повна адреса https:// (без пробілів) або шлях сайту з одним `/` (не `//` і не `/\`). */
export function isAnnouncementUrl(url: string): boolean {
  if (/\s/.test(url) || !isStorable(url)) return false;
  if (/^https:\/\/[^\s\\]+$/i.test(url)) return true;
  return /^\/(?![/\\])/.test(url);
}

/** Необов'язкове посилання: обрізане, '' чи відсутнє → null, інакше isAnnouncementUrl (53, 59). */
export function optionalSiteUrl(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((u) => (u ? u : null))
    .refine((u) => u === null || isAnnouncementUrl(u), 'bad url');
}

/** Межі строку (у майбутньому, не далі ANNOUNCEMENT_MAX_DAYS) перевіряє сервер (потрібне now). */
export const announcementInputSchema = z
  .object({
    text: z.string().trim().min(1).max(ANNOUNCEMENT_TEXT_MAX).refine(isStorable, UNSTORABLE),
    url: optionalSiteUrl(ANNOUNCEMENT_URL_MAX),
    expiresAt: z
      .string()
      .max(40)
      .refine((s) => /(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)), 'bad date')
      .nullable()
      .default(null),
  })
  .strict();
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
