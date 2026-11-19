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

/** Повна веб-адреса (http/https, без пробілів) або шлях сайту з `/` (не `//`). */
export function isAnnouncementUrl(url: string): boolean {
  if (/\s/.test(url)) return false;
  if (/^https?:\/\/\S+$/i.test(url)) return true;
  return url.startsWith('/') && !url.startsWith('//');
}

/** Межі строку (у майбутньому, не далі ANNOUNCEMENT_MAX_DAYS) перевіряє сервер (потрібне now). */
export const announcementInputSchema = z
  .object({
    text: z.string().trim().min(1).max(ANNOUNCEMENT_TEXT_MAX).refine(isStorable, UNSTORABLE),
    url: z
      .string()
      .trim()
      .max(ANNOUNCEMENT_URL_MAX)
      .nullable()
      .default(null)
      .transform((u) => (u ? u : null))
      .refine((u) => u === null || isAnnouncementUrl(u), 'bad url'),
    expiresAt: z
      .string()
      .max(40)
      .refine((s) => /(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)), 'bad date')
      .nullable()
      .default(null),
  })
  .strict();
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
