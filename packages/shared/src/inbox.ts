import { z } from 'zod';

/** 70: «Вхідні» на сайті — розсилки адміна й відповіді на «Щось не працює»; 72 — «тебе додали до групи». */

/** Скільки найновіших елементів показує сторінка `/inbox`. */
export const INBOX_MAX = 50;
/** Як часто меню перечитує бейдж «Вхідних». */
export const INBOX_POLL_MS = 60_000;
/** Цитата власного повідомлення у відповіді — до 200 символів. */
export const INBOX_QUOTE_MAX = 200;
/** Запрошення ввімкнути сповіщення після гри — не частіше, ніж раз на 14 днів. */
export const PUSH_INVITE_GAP_DAYS = 14;

export type InboxItem = { id: string; at: string; read: boolean } & (
  | { kind: 'broadcast'; title: string; text: string; url: string | null }
  /** problem.text — до INBOX_QUOTE_MAX символів. */
  | { kind: 'problem_reply'; reply: string; problem: { id: string; at: string; text: string } }
  /** 72: адмін додав людину до групи; назва — жива, з самої групи. */
  | { kind: 'group_added'; group: { id: string; title: string } }
);

export interface InboxPage {
  items: InboxItem[];
  /** Усі непрочитані людини, не лише показані. */
  unread: number;
}
export interface InboxBadge { unread: number }

/** Позначити прочитаними всі свої елементи, не новіші за upTo (час найновішого показаного). */
export const inboxReadSchema = z.object({ upTo: z.string().datetime() }).strict();
export type InboxReadInput = z.infer<typeof inboxReadSchema>;
