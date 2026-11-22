import { z } from 'zod';
import type { Quiz, RoundType } from './quiz';
import type { QuestionType } from './question-types';
import type { PrizeContent, PrizePlace } from './prizes';
import { pageCount } from './paging';
import type { GroupEmoji } from './groups';
import type { BotPlanReason, BotPlanStatus } from './bot-schedule';
import type { TeamForm } from './teams';
import type { AchievementId } from './achievements';
import type { AdminPlayerCard } from './player-card';
import type { FeedData } from './feed';
import type { MergeSummary } from './account-merge';

export const ADMIN_PAGE_SIZE = 50;
export const ADMIN_REASON_MAX = 500;
export const ADMIN_QUERY_MAX = 100;
/** 53: як часто вкладка «Живі ігри» оновлюється сама. */
export const ADMIN_LIVE_REFRESH_MS = 10_000;
/** 53: скільки днів (до сьогодні включно) показують графіки статистики. */
export const ADMIN_CHART_DAYS = 30;
/** 53: скільки живуть у кеші графіки й список резервних копій. */
export const ADMIN_CACHE_MS = 600_000;
export const ADMIN_ACTION_KINDS = ['ban', 'unban', 'quiz_delete', 'question_delete', 'prize_delete', 'award_delete', 'library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset', 'game_close', 'announcement_set', 'announcement_clear', 'bot_game_start', 'bot_copy', 'bot_quiz_delete', 'bot_plan_create', 'bot_plan_update', 'bot_plan_cancel', 'bot_plan_run', 'bot_plan_fail', 'quiz_view', 'achievement_grant', 'achievement_revoke', 'xp_adjust', 'prize_gift', 'gift_revoke', 'account_delete', 'bot_room_start', 'bot_room_pause', 'bot_room_resume', 'bot_room_end', 'bot_room_skip', 'bot_room_time', 'bot_room_end_round', 'bot_room_kick', 'bot_room_release', 'bot_room_teams', 'bot_room_lobby', 'bot_room_adjust', 'push_broadcast', 'feed_hide', 'feed_show', 'group_hide', 'group_restore', 'group_member_remove', 'group_owner_transfer', 'group_delete', 'group_item_hide', 'group_item_show', 'server_error_resolve', 'problem_resolve', 'problem_reply', 'backup_now', 'game_replay_view', 'account_merge', 'bot_room_host_open', 'bot_room_manual_on', 'bot_room_manual_off', 'bot_room_grade', 'bot_room_undo', 'bot_room_debuff', 'bot_room_hint'] as const;
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
export interface AdminLogDetails { reason?: string | null; title?: string; text?: string; content?: PrizeContent; code?: string; when?: string; achievementId?: AchievementId; amount?: number; /** 62: bot_room_lobby — shown in the lobby list; never the password, only whether there is one. */ listed?: boolean; locked?: boolean; /** 59: скільки людей отримають розсилку. */ count?: number; /** 63: подія стрічки, як була на мить дії. */ feed?: FeedData; /** 66: що перейшло на головний акаунт. */ merge?: MergeSummary }
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
/** @deprecated 71: замість цього — AdminMetrics. */
export interface AdminChartDay { day: string; players: number; games: number; finished: number; completion: number | null; returns: number | null }
/** @deprecated 71: замість цього — AdminMetrics. */
export interface AdminCharts { days: AdminChartDay[]; computedAt: string }
export type AdminBackupInfo = { state: 'ok'; at: string; bytes: number } | { state: 'none' | 'off' | 'error' };
/** 71: таблиці, рядки яких рахує «Стан». */
export const ADMIN_HEALTH_TABLES = ['user', 'quiz', 'game', 'participant', 'answer', 'game_event', 'saved_game', 'activity_day'] as const;
export type AdminHealthTable = (typeof ADMIN_HEALTH_TABLES)[number];
export interface AdminHealth {
  backup: AdminBackupInfo;
  uptimeSec: number;
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  rooms: number;
  connections: number;
  checkedAt: string;
  /** 71: версія, Node.js, запуск, процесор і затримка циклу подій за останню хвилину (null — ще немає знімка). */
  server: { commit: string | null; node: string; startedAt: string; cpuPercent: number | null; lagMs: { p50: number; p99: number; max: number } | null };
  /** 71: живі кімнати за станом. */
  live: { lobby: number; playing: number; paused: number; bot: number; autopilot: number; playersOnline: number; playersTotal: number; maxRooms: number; restarting: boolean };
  /** 71: null — запит до бази впав, «Стан» показується й без цього. */
  db: { bytes: number | null; rows: Record<AdminHealthTable, number>; push: { subscriptions: number; people: number } } | null;
  /** 71: копії в сховищі; null — список недоступний. */
  backups: { count: number; bytes: number } | null;
  /** 71: null — запит до бази впав. */
  problems: { errors24h: number; errorKinds24h: number; errorsNew: number; problemsOpen: number; reportsOpen: number } | null;
}
export interface AdminBotQuiz { id: string; title: string; rounds: number; questions: number; truth: boolean; updatedAt: string; /** 57: лічильники останньої перевірки цієї версії; null — не перевіряли чи змінено після перевірки. */ check: { errors: number; warnings: number } | null }
export type AdminBotStatus = 'lobby' | 'playing' | 'paused' | 'finished';
/** 62: one person of a bot room on the admin card. */
export interface AdminBotRoomPerson { id: string; nickname: string; online: boolean; team: string | null }
export interface AdminBotRoom {
  code: string;
  title: string;
  status: AdminBotStatus;
  players: { online: number; total: number };
  stageUrl: string;
  openedAt: string;
  /** Відкрите запитання (фаза question): лише тоді діють «Пропустити запитання» і «+30 с». */
  question: boolean;
  /** Є раунд, який можна завершити (фази раунду без паузи між раундами): лише тоді діє «Завершити раунд». */
  inRound: boolean;
  lobby: { listed: boolean; password: string | null };
  /** Люди в порядку приходу; командна гра — усі учасники (і ще без команди). */
  people: AdminBotRoomPerson[];
  /** Командна вікторина: поточний спосіб; null — соло. */
  teams: { form: TeamForm } | null;
  /** Продовжена гра (13b): лише тоді має сенс «Звільнити». */
  continued: boolean;
  /** 68: режим «Керую сам» — бот не робить кроків, керує адмін. */
  manual: boolean;
  /** 68: пульти адмінів на зв'язку. */
  hosts: number;
}
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
  /** 62: the opened room is shown in the lobby list. */
  listed: boolean;
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

/** 71: періоди вкладки «Метрики»; рік — 52 тижні. */
export const ADMIN_METRIC_PERIODS = [7, 30, 90, 365] as const;
export type AdminMetricPeriod = (typeof ADMIN_METRIC_PERIODS)[number];
export const metricBucket = (period: AdminMetricPeriod): 'day' | 'week' => (period === 365 ? 'week' : 'day');
export const adminMetricsQuerySchema = z
  .object({
    period: z.coerce
      .number()
      .int()
      .refine((n): n is AdminMetricPeriod => (ADMIN_METRIC_PERIODS as readonly number[]).includes(n))
      .default(30),
  })
  .strict();
/** 71: активний час у редакторі — порція від клієнта; start — перша порція цього відкриття редактора. */
export const EDITOR_TIME_MAX_SEC = 600;
export const editorTimeSchema = z.object({ seconds: z.number().int().min(1).max(EDITOR_TIME_MAX_SEC), start: z.boolean() }).strict();
export type EditorTimeInput = z.infer<typeof editorTimeSchema>;

/** 71: один кошик метрик — день або тиждень (рік). Частки й середні — null, коли ділити нема на що. */
export interface AdminMetricBucket {
  /** Київський день початку кошика, 'YYYY-MM-DD'. */
  start: string;
  /** 1 або 7. */
  days: number;
  /** Різні акаунти, що заходили на сайт (activity_day). */
  active: number;
  /** Різні акаунти, що зіграли гру. */
  players: number;
  games: number;
  finished: number;
  aborted: number;
  /** Ігри за ведучим: людина сама, автопілот людини, бот. */
  hosted: number;
  autopilot: number;
  bot: number;
  /** Дограно, %. */
  completion: number | null;
  /** Повернення, % (для тижня — на останній день тижня). */
  returns: number | null;
  /** Середнє людей у дограній грі. */
  avgPlayers: number | null;
  /** Сума тривалостей дограних ігор, хв (кожна ≤ 240). */
  gameMin: number;
  /** Тривалість × людей, хв. */
  playerMin: number;
  newUsers: number;
  newQuizzes: number;
  editorMin: number;
}
/** 71: підсумок за період. */
export interface AdminMetricsSummary {
  games: number;
  finished: number;
  completion: number | null;
  avgPlayers: number | null;
  medianGameMin: number | null;
  avgGameMin: number | null;
  gameHours: number;
  playerHours: number;
  hosted: number;
  autopilot: number;
  bot: number;
  newUsers: number;
  /** % нових акаунтів, що зіграли гру протягом 7 днів після реєстрації; null — нових немає. */
  activation: number | null;
  /** Середнє активних на день. */
  dau: number;
  /** Різні акаунти за останні 7 / 30 днів періоду. */
  wau: number;
  mau: number;
  /** dau / mau, %. */
  stickiness: number | null;
  editorHours: number;
  editorSessions: number;
  editorSessionMin: number | null;
  editors: number;
  newQuizzes: number;
}
export interface AdminMetricsTopQuiz { id: string; title: string; author: string; games: number; avgPlayers: number | null; avgMin: number | null }
export interface AdminMetricsTopEditor { userId: string; nickname: string; minutes: number; sessions: number }
export interface AdminMetrics {
  period: AdminMetricPeriod;
  bucket: 'day' | 'week';
  buckets: AdminMetricBucket[];
  summary: AdminMetricsSummary;
  /** Такий самий підсумок за попередній рівний період; null — там немає ні гри, ні рядка активності. */
  previous: AdminMetricsSummary | null;
  /** Найраніший день activity_day; null — даних ще немає. */
  trackedSince: string | null;
  topQuizzes: AdminMetricsTopQuiz[];
  roundTypes: { type: RoundType; games: number }[];
  questionTypes: { type: QuestionType; plays: number }[];
  /** Зі скількох дограних ігор пораховано questionTypes (межа — 1000 найновіших). */
  questionTypesGames: number;
  /** 24 числа: старти ігор за годиною за Києвом. */
  hours: number[];
  topEditors: AdminMetricsTopEditor[];
  computedAt: string;
}

export const adminBotCopySchema = z.object({ quizId: z.string().uuid() }).strict();

export function adminPages(total: number): number {
  return pageCount(total, ADMIN_PAGE_SIZE);
}

/** 63: групи видів журналу для фільтра «Що». Кожен вид — рівно в одній групі. */
export const ADMIN_LOG_GROUPS = ['moderation', 'players', 'games', 'bot', 'announcements', 'system'] as const;
export type AdminLogGroup = (typeof ADMIN_LOG_GROUPS)[number];
export const ADMIN_LOG_GROUP_KINDS: Record<AdminLogGroup, readonly AdminActionKind[]> = {
  moderation: ['ban', 'unban', 'quiz_delete', 'question_delete', 'library_hide', 'library_restore', 'report_dismiss', 'appeal_reject', 'nickname_reset', 'avatar_reset', 'feed_hide', 'feed_show', 'group_hide', 'group_restore', 'group_member_remove', 'group_owner_transfer', 'group_delete', 'group_item_hide', 'group_item_show'],
  players: ['quiz_view', 'prize_delete', 'award_delete', 'achievement_grant', 'achievement_revoke', 'xp_adjust', 'prize_gift', 'gift_revoke', 'account_delete', 'account_merge'],
  games: ['game_close', 'game_replay_view'],
  bot: ['bot_game_start', 'bot_copy', 'bot_quiz_delete', 'bot_plan_create', 'bot_plan_update', 'bot_plan_cancel', 'bot_plan_run', 'bot_plan_fail', 'bot_room_start', 'bot_room_pause', 'bot_room_resume', 'bot_room_end', 'bot_room_skip', 'bot_room_time', 'bot_room_end_round', 'bot_room_kick', 'bot_room_release', 'bot_room_teams', 'bot_room_lobby', 'bot_room_adjust', 'bot_room_host_open', 'bot_room_manual_on', 'bot_room_manual_off', 'bot_room_grade', 'bot_room_undo', 'bot_room_debuff', 'bot_room_hint'],
  announcements: ['announcement_set', 'announcement_clear', 'push_broadcast'],
  /** 64: збої, звернення, резервні копії. */
  system: ['server_error_resolve', 'problem_resolve', 'problem_reply', 'backup_now'],
};
/** 63: скільки рядків журналу йде у вивантаження CSV щонайбільше. */
export const ADMIN_LOG_EXPORT_MAX = 10_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** 63: 'YYYY-MM-DD' — і справжня календарна дата (не 2026-02-30). */
export function isDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const ms = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === text;
}

const logDay = z.string().refine(isDay, 'bad_day').optional();

const adminLogFields = z
  .object({
    /** admin_action.admin_id */
    admin: z.string().min(1).max(64).optional(),
    /** 'moderation,bot' → ['moderation', 'bot'] без повторів; невідома група — помилка. */
    groups: z
      .string()
      .max(200)
      .transform((text, ctx) => {
        const out: AdminLogGroup[] = [];
        for (const part of text.split(',')) {
          if (!(ADMIN_LOG_GROUPS as readonly string[]).includes(part)) {
            ctx.addIssue({ code: 'custom', message: 'bad_group' });
            return z.NEVER;
          }
          if (!out.includes(part as AdminLogGroup)) out.push(part as AdminLogGroup);
        }
        return out;
      })
      .optional(),
    /** київський день, включно */
    from: logDay,
    /** київський день, включно */
    to: logDay,
    q: z
      .string()
      .trim()
      .max(ADMIN_QUERY_MAX)
      .optional()
      .transform((q) => (q ? q : undefined)),
  })
  .strict();

function dayOrder(filter: { from?: string; to?: string }): boolean {
  return !filter.from || !filter.to || filter.from <= filter.to;
}

export const adminLogFilterSchema = adminLogFields.refine(dayOrder, { message: 'bad_range', path: ['to'] });
export const adminLogQuerySchema = adminLogFields
  .extend({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .strict()
  .refine(dayOrder, { message: 'bad_range', path: ['to'] });
export type AdminLogFilter = z.output<typeof adminLogFilterSchema>;
export type AdminLogQuery = z.output<typeof adminLogQuerySchema>;
export interface AdminLogPage extends AdminList<AdminLogEntry> { admins: { id: string; nickname: string }[] }
export interface AdminLogExport { rows: AdminLogEntry[]; total: number }
