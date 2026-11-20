import { z } from 'zod';
import { UNSTORABLE, isStorable } from './text';
import { localeSchema } from './locale';

/** 64: збої сервера, скарги гравців і копії бази. */

/** Повідомлення збою — до 500 символів. */
export const SERVER_ERROR_MESSAGE_MAX = 500;
/** Стек збою — до 4096 байтів UTF-8. */
export const SERVER_ERROR_STACK_MAX = 4096;
export const SERVER_ERROR_DAY_MS = 86_400_000;
/** Збої, яких не було 30 днів, видаляються. */
export const SERVER_ERROR_KEEP_DAYS = 30;
/** Як часто буфер збоїв пишеться в базу. */
export const SERVER_ERROR_FLUSH_MS = 5000;
/** Скільки різних відбитків тримає буфер між записами; решта відкидається. */
export const SERVER_ERROR_BUFFER_MAX = 50;

export const PROBLEM_TEXT_MAX = 1000;
export const PROBLEM_REPLY_MAX = 500;
export const PROBLEM_PATH_MAX = 300;
export const PROBLEM_BROWSER_MAX = 300;
/** Скарг на годину з однієї адреси гостя. */
export const PROBLEM_GUEST_PER_HOUR = 3;
/** Скарг на годину від одного акаунта. */
export const PROBLEM_USER_PER_HOUR = 5;
/** Скарг на годину від усіх гостей разом. */
export const PROBLEM_GUESTS_PER_HOUR_ALL = 50;
/** Скільки своїх скарг бачить гравець. */
export const PROBLEM_MINE_MAX = 20;

/** Ручна копія — не частіше, ніж раз на годину. */
export const BACKUP_MANUAL_GAP_MS = 3_600_000;
export const BACKUP_LIST_MAX = 50;

/** Команди відновлення — код, не перекладається. */
export const BACKUP_RESTORE_COMMANDS = {
  list: 'pnpm --filter @quiz/server db:restore --r2-list',
  latest: 'pnpm --filter @quiz/server db:restore --r2-latest',
  key: 'pnpm --filter @quiz/server db:restore --r2 {key}',
} as const;

/**
 * Лише шлях сторінки сайту: до першого `?` чи `#` (там бувають токени), до PROBLEM_PATH_MAX символів.
 * Не з `/` або з `//` (адреса іншого сайту) → `/`.
 */
export function cleanPagePath(path: string): string {
  const cut = path.split(/[?#]/, 1)[0] ?? '';
  if (!cut.startsWith('/') || cut.startsWith('//')) return '/';
  return cut.slice(0, PROBLEM_PATH_MAX);
}

export const problemPageSchema = z
  .object({
    path: z.string().max(2000).transform(cleanPagePath),
    browser: z.string().max(1000).transform((s) => s.slice(0, PROBLEM_BROWSER_MAX)),
    screen: z.string().regex(/^\d{2,5}x\d{2,5}$/),
    lang: localeSchema,
    theme: z.enum(['light', 'dark']),
  })
  .strict();
export type ProblemPage = z.infer<typeof problemPageSchema>;

export const problemReportInputSchema = z
  .object({
    text: z.string().trim().min(1).max(PROBLEM_TEXT_MAX).refine(isStorable, UNSTORABLE),
    page: problemPageSchema.nullable().default(null),
  })
  .strict();
export type ProblemReportInput = z.infer<typeof problemReportInputSchema>;

export const problemReplySchema = z
  .object({ text: z.string().trim().min(1).max(PROBLEM_REPLY_MAX).refine(isStorable, UNSTORABLE) })
  .strict();

const adminPage = z.coerce.number().int().min(1).max(100000).default(1);
export const adminErrorsQuerySchema = z.object({ status: z.enum(['new', 'resolved']).default('new'), page: adminPage });
export const adminProblemsQuerySchema = z.object({ status: z.enum(['open', 'resolved']).default('open'), page: adminPage });

export interface AdminServerError {
  id: string;
  where: string;
  what: string | null;
  event: string | null;
  name: string;
  message: string;
  stack: string | null;
  count: number;
  /** Повторів за останню добу; 0, якщо добове вікно минуло. */
  dayCount: number;
  firstAt: string;
  lastAt: string;
  status: 'new' | 'resolved';
  /** Нік адміна, що вирішив. */
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export type ProblemAuthor =
  | { kind: 'guest' }
  /** push — у автора є хоч одна підписка на сповіщення. */
  | { kind: 'account'; id: string; nickname: string; push: boolean }
  | { kind: 'deleted' };

export interface AdminProblemReport {
  id: string;
  at: string;
  who: ProblemAuthor;
  text: string;
  page: ProblemPage | null;
  status: 'open' | 'resolved';
  reply: string | null;
  repliedAt: string | null;
  /** Нік адміна, що закрив. */
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface MyProblemReport {
  id: string;
  at: string;
  text: string;
  status: 'open' | 'resolved';
  reply: string | null;
  repliedAt: string | null;
}

export interface AdminProblemsBadge { errors: number; reports: number }

export interface AdminBackupRow { key: string; at: string; bytes: number; level: number }

export interface BackupRun {
  at: string;
  by: 'schedule' | 'admin';
  outcome: 'ok' | 'failed' | 'locked';
  key: string | null;
  bytes: number | null;
}

export interface AdminBackups {
  /** Є сховище R2. */
  stored: boolean;
  /** На цьому сервері можна знімати копії. */
  enabled: boolean;
  rows: AdminBackupRow[];
  running: boolean;
  last: BackupRun | null;
  nextAt: string | null;
}
