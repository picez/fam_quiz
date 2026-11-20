import { z } from 'zod';
import type { Quiz } from './quiz';
import type { PrizeContent, PrizePlace } from './prizes';
import { pageCount } from './paging';
import type { GroupEmoji } from './groups';
import type { BotPlanReason, BotPlanStatus } from './bot-schedule';
import type { AchievementId } from './achievements';
import type { AdminPlayerCard } from './player-card';

export const ADMIN_PAGE_SIZE = 50;
export const ADMIN_REASON_MAX = 500;
export const ADMIN_QUERY_MAX = 100;
/** 53: як часто вкладка «Живі ігри» оновлюється сама. */
export const ADMIN_LIVE_REFRESH_MS = 10_000;
/** 53: скільки днів (до сьогодні включно) показують графіки статистики. */
export const ADMIN_CHART_DAYS = 30;
/** 53: скільки живуть у кеші графіки й список резервних копій. */
export const ADMIN_CACHE_MS = 600_000;
export const ADMIN_ACTION_KINDS = ['ban', 'unban', 'quiz_delete', 'question_delete', 'prize_delete', 'award_delete', 'library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset', 'game_close', 'announcement_set', 'announcement_clear', 'bot_game_start', 'bot_copy', 'bot_quiz_delete', 'bot_plan_create', 'bot_plan_update', 'bot_plan_cancel', 'bot_plan_run', 'bot_plan_fail', 'quiz_view', 'achievement_grant', 'achievement_revoke', 'xp_adjust', 'prize_gift', 'gift_revoke', 'account_delete'] as const;
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
  id: string; nickname: string | null; email: string; createdAt: string;
  games: number; quizzes: number; admin: boolean;
  banned: { at: string; reason: string | null } | null;
}
export interface AdminQuizRow {
  id: string; title: string; author: { id: string; nickname: string | null }; authorBanned: boolean;
  questionCount: number; games: number; updatedAt: string;
  /** Є раунд «Правда про гравця»: його запитань у questionCount немає. */
  truth?: boolean;
}
export interface AdminQuizView { id: string; author: { id: string; nickname: string | null }; quiz: Quiz; updatedAt: string; effects: Record<string, RemovalEffect> }
export interface AdminPrize { id: string; content: PrizeContent; status: 'free' | 'reserved'; createdAt: string }
export interface AdminAward { id: string; place: PrizePlace; content: PrizeContent; quizTitle: string; awardedAt: string; /** 58: подарунок адміна (не з гри); null — звичайна нагорода. */ gift: { note: string | null } | null }
export interface AdminUserDetail { user: AdminUserRow; stock: AdminPrize[]; awards: AdminAward[]; title: { text: string; until: string } | null; card: AdminPlayerCard }
export interface AdminLogDetails { reason?: string | null; title?: string; text?: string; content?: PrizeContent; code?: string; when?: string; achievementId?: AchievementId; amount?: number }
export type AdminLiveStatus = 'lobby' | 'starting' | 'playing' | 'paused' | 'finished';
export interface AdminLiveRoom {
  code: string;
  title: string;
  /** Нік акаунта ведучого (для автопілота — автора); null — гра без акаунта. Email не йде ніколи. */
  host: string | null;
  autopilot: boolean;
  players: { online: number; total: number };
  status: AdminLiveStatus;
  round: { number: number; of: number } | null;
  openedAt: string;
  actedAt: string;
  /** /stage/{code}#{stageToken} — як посилання на сцену в пульті. */
  stageUrl: string;
}
export interface AdminLiveList { rooms: AdminLiveRoom[]; at: string }
export interface AdminChartDay { day: string; players: number; games: number; finished: number; completion: number | null; returns: number | null }
export interface AdminCharts { days: AdminChartDay[]; computedAt: string }
export type AdminBackupInfo = { state: 'ok'; at: string; bytes: number } | { state: 'none' | 'off' | 'error' };
export interface AdminHealth { backup: AdminBackupInfo; uptimeSec: number; memory: { rss: number; heapUsed: number }; rooms: number; connections: number; checkedAt: string }
export interface AdminBotQuiz { id: string; title: string; rounds: number; questions: number; truth: boolean; updatedAt: string; /** 57: лічильники останньої перевірки цієї версії; null — не перевіряли чи змінено після перевірки. */ check: { errors: number; warnings: number } | null }
export type AdminBotStatus = 'lobby' | 'playing' | 'paused' | 'finished';
export interface AdminBotRoom { code: string; title: string; status: AdminBotStatus; players: { online: number; total: number }; stageUrl: string; openedAt: string }
/** 56: кому сповістити про план; `name: null` — групу видалено. */
export type AdminBotPlanTo =
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'group'; groupId: string; name: string | null }
  | { kind: 'people'; people: { id: string; nickname: string }[] };
export interface AdminBotPlan {
  id: string;
  quizId: string | null;
  title: string;
  startsAt: string;
  to: AdminBotPlanTo;
  autoStartMin: number | null;
  weekly: boolean;
  status: BotPlanStatus;
  reason: BotPlanReason | null;
  code: string | null;
}
export interface AdminBotGroup { id: string; name: string; emoji: GroupEmoji; members: number }
export interface AdminBotPerson { id: string; nickname: string; avatar: string | null }
export interface AdminBot {
  bot: { nickname: string | null; ready: boolean };
  quizzes: AdminBotQuiz[];
  rooms: AdminBotRoom[];
  roomsMax: number;
  schedule: { plans: AdminBotPlan[]; groups: AdminBotGroup[]; max: number };
}
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

export const adminBotCopySchema = z.object({ quizId: z.string().uuid() }).strict();

export function adminPages(total: number): number {
  return pageCount(total, ADMIN_PAGE_SIZE);
}
