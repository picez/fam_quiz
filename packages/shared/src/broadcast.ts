import { z } from 'zod';
import { UNSTORABLE, isStorable } from './text';
import { ANNOUNCEMENT_URL_MAX, optionalSiteUrl } from './announcement';
import { BOT_PLAN_PEOPLE_MAX } from './bot-schedule';
import type { AdminBotGroup, AdminBotPlanTo } from './admin';

/** 59: push-розсилка адміна. */
export const BROADCAST_TITLE_MAX = 60;
export const BROADCAST_TEXT_MAX = 160;
export const BROADCAST_URL_MAX = ANNOUNCEMENT_URL_MAX;
/** Не частіше, ніж раз на 10 хв (спільно для всіх адмінів). */
export const BROADCAST_GAP_MS = 10 * 60_000;
/** Не більше 10 за ковзну добу. */
export const BROADCAST_DAY_MAX = 10;
export const BROADCAST_DAY_MS = 86_400_000;
/** Скільки розсилок показує історія. */
export const BROADCAST_HISTORY = 50;
/** Рядок `sending`, старший за це, показується «перерваним». */
export const BROADCAST_STALE_MS = 15 * 60_000;
export const BROADCAST_PEOPLE_MAX = BOT_PLAN_PEOPLE_MAX;

export const broadcastRecipientsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('group'), groupId: z.string().uuid() }).strict(),
  z
    .object({
      kind: z.literal('people'),
      userIds: z
        .array(z.string().min(1).max(64))
        .min(1)
        .max(BROADCAST_PEOPLE_MAX)
        .refine((ids) => new Set(ids).size === ids.length, 'duplicate'),
    })
    .strict(),
]);
export type BroadcastRecipients = z.infer<typeof broadcastRecipientsSchema>;

export const broadcastPreviewSchema = z.object({ recipients: broadcastRecipientsSchema }).strict();

export const broadcastInputSchema = z
  .object({
    title: z.string().trim().min(1).max(BROADCAST_TITLE_MAX).refine(isStorable, UNSTORABLE),
    text: z.string().trim().min(1).max(BROADCAST_TEXT_MAX).refine(isStorable, UNSTORABLE),
    url: optionalSiteUrl(BROADCAST_URL_MAX),
    recipients: broadcastRecipientsSchema,
  })
  .strict();
export type BroadcastInput = z.infer<typeof broadcastInputSchema>;

export type BroadcastStatus = 'sending' | 'sent' | 'interrupted';
export type AdminBroadcastTo = Exclude<AdminBotPlanTo, { kind: 'none' }>;
export interface AdminBroadcast {
  id: string;
  at: string;
  /** Нік адміна; null — акаунт видалено. */
  admin: string | null;
  title: string;
  text: string;
  url: string | null;
  to: AdminBroadcastTo;
  /** Скільки людей мали отримати. */
  people: number;
  /** Лічильники — у пристроях (підписках), не в людях. */
  delivered: number;
  failed: number;
  status: BroadcastStatus;
}
export interface AdminBroadcastLimits {
  /** Раніше цього часу нову розсилку не можна; null — можна вже. */
  nextAt: string | null;
  lastDay: number;
  dayMax: number;
}
export interface AdminBroadcasts { rows: AdminBroadcast[]; groups: AdminBotGroup[]; limits: AdminBroadcastLimits; pushOn: boolean }
export interface BroadcastPreview { people: number }
