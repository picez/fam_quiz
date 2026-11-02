import { z } from 'zod';
import type { Quiz } from './quiz';
import type { PrizeContent, PrizePlace } from './prizes';

export const ADMIN_PAGE_SIZE = 50;
export const ADMIN_REASON_MAX = 500;
export const ADMIN_QUERY_MAX = 100;
export const ADMIN_ACTION_KINDS = ['ban', 'unban', 'quiz_delete', 'question_delete', 'prize_delete', 'award_delete'] as const;
export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number];
export type RemovalEffect = 'question' | 'category' | 'round' | 'last_question' | 'not_found' | 'locked';

export interface AdminStats {
  users: { total: number; new7: number; new30: number; online: number };
  games: { live: number; today: number; days7: number; days30: number };
  quizzes: { total: number };
  topQuizzes: { id: string; title: string; author: string; games: number }[];
}
export interface AdminList<T> { rows: T[]; total: number; page: number; pages: number }
export interface AdminUserRow {
  id: string; nickname: string; email: string; createdAt: string;
  games: number; quizzes: number; admin: boolean;
  banned: { at: string; reason: string | null } | null;
}
export interface AdminQuizRow {
  id: string; title: string; author: { id: string; nickname: string }; authorBanned: boolean;
  questionCount: number; games: number; updatedAt: string;
}
export interface AdminQuizView { id: string; author: { id: string; nickname: string }; quiz: Quiz; updatedAt: string; effects: Record<string, RemovalEffect> }
export interface AdminPrize { id: string; content: PrizeContent; status: 'free' | 'reserved'; createdAt: string }
export interface AdminAward { id: string; place: PrizePlace; content: PrizeContent; quizTitle: string; awardedAt: string }
export interface AdminUserDetail { user: AdminUserRow; stock: AdminPrize[]; awards: AdminAward[]; title: { text: string; until: string } | null }
export interface AdminLogDetails { reason?: string | null; title?: string; text?: string; content?: PrizeContent }
export interface AdminLogEntry { id: string; at: string; admin: string; kind: AdminActionKind; target: string; details: AdminLogDetails }

export const adminListQuerySchema = z
  .object({
    q: z.string().trim().max(ADMIN_QUERY_MAX).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();

export const banSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(ADMIN_REASON_MAX)
      .optional()
      .transform((r) => (r ? r : null)),
  })
  .strict();

export function adminPages(total: number): number {
  return Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
}
