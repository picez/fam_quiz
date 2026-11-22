import { z } from 'zod';
import { ADMIN_REASON_MAX, type AdminList } from './admin';
import { FEED_KINDS, type FeedData } from './feed';
import { GROUP_LIMITS, groupItemInputSchema, type GroupEmoji, type GroupItemKind, type GroupRole } from './groups';

/** 63: види подій стрічки, які модерує адмін (картки «вподобав» не є подіями). */
export const ADMIN_FEED_KINDS = FEED_KINDS.filter((k): k is Exclude<(typeof FEED_KINDS)[number], 'like'> => k !== 'like');
export type AdminFeedKind = (typeof ADMIN_FEED_KINDS)[number];

export const adminFeedQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    user: z.string().min(1).max(64).optional(),
    kind: z.enum(ADMIN_FEED_KINDS as [AdminFeedKind, ...AdminFeedKind[]]).optional(),
  })
  .strict();

export interface AdminFeedRow {
  id: string;
  at: string;
  who: { id: string; nickname: string | null };
  data: FeedData;
  /** рахуються, лише коли не приховано */
  likes: number;
  hidden: { at: string } | null;
}

/** Одна схема для «Сховати»/«Показати» події стрічки й запису групи. */
export const adminHideSchema = z.object({ hidden: z.boolean() }).strict();

export const adminGroupHideSchema = z
  .object({
    hidden: z.boolean(),
    reason: z
      .string()
      .trim()
      .max(ADMIN_REASON_MAX)
      .optional()
      .transform((r) => r || null),
  })
  .strict();

export const adminGroupOwnerSchema = z.object({ userId: z.string().min(1).max(64) }).strict();
/** Підтвердження видалення: назва групи (збіг — після trim() обох, з урахуванням регістру). */
export const adminGroupDeleteSchema = z.object({ name: z.string().max(GROUP_LIMITS.nameMax + 10) }).strict();

export interface AdminGroupRow {
  id: string;
  name: string;
  emoji: GroupEmoji;
  owner: { id: string; nickname: string | null } | null;
  /** усі, з заблокованими */
  members: number;
  items: number;
  createdAt: string;
  hidden: { at: string; reason: string | null } | null;
}
export interface AdminGroupMember { id: string; nickname: string | null; role: GroupRole; joinedAt: string; banned: boolean }
export interface AdminGroupItem {
  id: string;
  kind: GroupItemKind;
  text: string;
  /** нік; null — акаунт видалено */
  author: string | null;
  surprise: boolean;
  createdAt: string;
  hidden: boolean;
}
/** Записи — сторінками по 50, найновіші першими; адмін бачить і сюрпризи. */
export interface AdminGroupDetail { group: AdminGroupRow; members: AdminGroupMember[]; items: AdminList<AdminGroupItem> }

/** 72: адмін додає людину до групи напряму. */
export const adminGroupMemberAddSchema = z.object({ userId: z.string().min(1).max(64) }).strict();
/** 72: запис від Квіз-бота — та сама форма, що в учасника, але без фото й без сюрпризу. */
export const adminGroupItemSchema = groupItemInputSchema.refine((item) => !item.surprise && item.photo === null, { message: 'admin_item_plain' });
/** 72: pushed — у людини є підписка й push-служба є (сповіщення у «Вхідних» є завжди). */
export interface AdminGroupMemberAdded { changed: true; pushed: boolean }
