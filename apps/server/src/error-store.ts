import {
  ADMIN_PAGE_SIZE,
  SERVER_ERROR_BUFFER_MAX,
  SERVER_ERROR_DAY_MS,
  SERVER_ERROR_FLUSH_MS,
  SERVER_ERROR_KEEP_DAYS,
  SERVER_ERROR_MESSAGE_MAX,
  SERVER_ERROR_STACK_MAX,
  adminPages,
  pageOffset,
  type AdminList,
  type AdminProblemsBadge,
  type AdminServerError,
} from '@quiz/shared';
import { and, count, desc, eq, lt, sql } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { problemReport, profile, serverError } from './db/schema';
import { errorFingerprint, errorParts, maskPersonal, shortenStack, truncateBytes, truncateChars } from './error-mask';
import { log, type ErrorContext } from './log';
import { openComplaints } from './report-store';
import { realScheduler, type Scheduler } from './rooms/scheduler';

/**
 * Збої сервера в базі (64): другий слот reportError (setErrorSink). record — синхронний і без бази:
 * маскує, рахує відбиток і складає повтори в буфер; flush раз на flushMs пише один upsert на відбиток.
 * Збій запису — лише log.warn, ніколи reportError: інакше збій бази породжував би нові збої без кінця.
 */
export interface ErrorStore {
  record(error: unknown, context: ErrorContext): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

interface Pending {
  fingerprint: string;
  where: string;
  what: string | null;
  event: string | null;
  name: string;
  message: string;
  stack: string | null;
  n: number;
  firstAt: Date;
  lastAt: Date;
}

const PRUNE_EVERY_MS = 3_600_000;

/** Без нульового символу: PostgreSQL не прийняв би рядок. */
function clean(text: string): string {
  return text.replace(/\u0000/g, '');
}

export function createErrorStore(options: { db: Db; now?: () => Date; flushMs?: number; scheduler?: Scheduler }): ErrorStore {
  const { db } = options;
  const scheduler = options.scheduler ?? realScheduler;
  const now = options.now ?? (() => new Date(scheduler.now()));
  const flushMs = options.flushMs ?? SERVER_ERROR_FLUSH_MS;
  let buffer = new Map<string, Pending>();
  let dropped = 0;
  let timer: unknown = null;
  let flushing: Promise<void> | null = null;
  let stopped = false;
  let lastPrune = now().getTime();

  function arm(): void {
    if (timer !== null || stopped) return;
    timer = scheduler.setTimeout(() => {
      timer = null;
      void flush();
    }, flushMs);
    (timer as { unref?: () => void } | null)?.unref?.();
  }

  function record(error: unknown, context: ErrorContext): void {
    if (stopped) return;
    try {
      const at = now();
      const fingerprint = errorFingerprint(error, context);
      const known = buffer.get(fingerprint);
      if (known !== undefined) {
        known.n += 1;
        known.lastAt = at;
        return;
      }
      if (buffer.size >= SERVER_ERROR_BUFFER_MAX) {
        dropped += 1;
        return;
      }
      const parts = errorParts(error);
      buffer.set(fingerprint, {
        fingerprint,
        where: clean(maskPersonal(context.where)),
        what: context.what === undefined ? null : clean(maskPersonal(context.what)),
        event: context.event === undefined ? null : clean(maskPersonal(context.event)),
        name: truncateChars(clean(maskPersonal(parts.name)), 200),
        message: truncateChars(clean(maskPersonal(parts.message)), SERVER_ERROR_MESSAGE_MAX),
        stack: parts.stack === null ? null : truncateBytes(clean(maskPersonal(shortenStack(parts.stack))), SERVER_ERROR_STACK_MAX),
        n: 1,
        firstAt: at,
        lastAt: at,
      });
      arm();
    } catch {
      // Збирач збоїв не має права кидати сам.
    }
  }

  async function write(batch: Pending[], lost: number): Promise<void> {
    let failed = 0;
    for (const p of batch) {
      try {
        const dayAgo = sql`${serverError.dayStart} <= ${p.lastAt.toISOString()}::timestamptz - interval '24 hours'`;
        await db
          .insert(serverError)
          .values({
            fingerprint: p.fingerprint,
            where: p.where,
            what: p.what,
            event: p.event,
            name: p.name,
            message: p.message,
            stack: p.stack,
            count: p.n,
            dayCount: p.n,
            dayStart: p.firstAt,
            firstAt: p.firstAt,
            lastAt: p.lastAt,
          })
          .onConflictDoUpdate({
            target: serverError.fingerprint,
            targetWhere: sql`status = 'new'`,
            set: {
              count: sql`${serverError.count} + ${p.n}`,
              lastAt: sql`greatest(${serverError.lastAt}, ${p.lastAt.toISOString()}::timestamptz)`,
              dayCount: sql`case when ${dayAgo} then ${p.n} else ${serverError.dayCount} + ${p.n} end`,
              dayStart: sql`case when ${dayAgo} then ${p.firstAt.toISOString()}::timestamptz else ${serverError.dayStart} end`,
            },
          });
      } catch (error) {
        failed += 1;
        if (failed === 1) warn(error, 'Не вдалося записати збій у базу');
      }
    }
    if (lost > 0) warn(null, `Забагато різних збоїв: ${lost} не записано`, { dropped: lost });
    const at = now().getTime();
    if (at - lastPrune >= PRUNE_EVERY_MS) {
      lastPrune = at;
      try {
        await db.delete(serverError).where(lt(serverError.lastAt, new Date(at - SERVER_ERROR_KEEP_DAYS * SERVER_ERROR_DAY_MS)));
      } catch (error) {
        warn(error, 'Не вдалося прибрати старі збої');
      }
    }
  }

  function flush(): Promise<void> {
    const run = async (): Promise<void> => {
      if (flushing !== null) await flushing;
      const batch = [...buffer.values()];
      const lost = dropped;
      buffer = new Map();
      dropped = 0;
      await write(batch, lost);
    };
    const current = run()
      .catch(() => undefined)
      .finally(() => {
        if (flushing === current) flushing = null;
      });
    flushing = current;
    return current;
  }

  async function stop(): Promise<void> {
    if (timer !== null) {
      scheduler.clearTimeout(timer);
      timer = null;
    }
    if (stopped) {
      await flushing;
      return;
    }
    stopped = true;
    await flush();
  }

  return { record, flush, stop };
}

/** log.warn, що сам ніколи не кидає; без reportError — щоб не зациклитись. */
function warn(error: unknown, message: string, extra: Record<string, unknown> = {}): void {
  try {
    log.warn({ ...(error === null ? {} : { err: error }), ...extra }, message);
  } catch {
    // Журнал не має права покласти процес.
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Збої для вкладки «Збої» адмінки: від останнього повтору; dayCount = 0, якщо добове вікно минуло. */
export async function listServerErrors(db: Db, query: { status: 'new' | 'resolved'; page: number }, now: Date): Promise<AdminList<AdminServerError>> {
  const where = eq(serverError.status, query.status);
  const [{ n }] = await db.select({ n: count() }).from(serverError).where(where);
  const total = Number(n);
  const rows = await db
    .select({ row: serverError, resolver: profile.nickname })
    .from(serverError)
    .leftJoin(profile, eq(profile.userId, serverError.resolvedBy))
    .where(where)
    .orderBy(desc(serverError.lastAt), serverError.id)
    .limit(ADMIN_PAGE_SIZE)
    .offset(pageOffset(query.page, ADMIN_PAGE_SIZE));
  const dayAgo = now.getTime() - SERVER_ERROR_DAY_MS;
  return {
    rows: rows.map(({ row, resolver }) => ({
      id: row.id,
      where: row.where,
      what: row.what,
      event: row.event,
      name: row.name,
      message: row.message,
      stack: row.stack,
      count: row.count,
      dayCount: row.dayStart.getTime() <= dayAgo ? 0 : row.dayCount,
      firstAt: row.firstAt.toISOString(),
      lastAt: row.lastAt.toISOString(),
      status: row.status,
      resolvedBy: row.resolvedBy === null ? null : (resolver ?? ''),
      resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.toISOString(),
    })),
    total,
    page: query.page,
    pages: adminPages(total),
  };
}

/** «Позначити як вирішене»: у транзакції статус і рядок журналу; уже вирішене — already, без журналу. */
export async function resolveServerError(db: Db, input: { adminId: string; id: string; now: Date }): Promise<'ok' | 'not_found' | 'already'> {
  if (!UUID.test(input.id)) return 'not_found';
  return db.transaction(async (tx) => {
    const [changed] = await tx
      .update(serverError)
      .set({ status: 'resolved', resolvedBy: input.adminId, resolvedAt: input.now })
      .where(and(eq(serverError.id, input.id), eq(serverError.status, 'new')))
      .returning({ where: serverError.where, message: serverError.message });
    if (changed === undefined) {
      const [exists] = await tx.select({ id: serverError.id }).from(serverError).where(eq(serverError.id, input.id));
      return exists === undefined ? 'not_found' : 'already';
    }
    await logAction(tx, { adminId: input.adminId, kind: 'server_error_resolve', targetUserId: null, details: { title: `${changed.where}: ${truncateChars(changed.message, 80)}` }, now: input.now });
    return 'ok';
  });
}

/** Спільний бейдж «Звернень» (70): нові збої, відкриті «Щось не працює» й елементи черги модерації. */
export async function problemsBadge(db: Db): Promise<AdminProblemsBadge> {
  const [[errors], [reports], complaints] = await Promise.all([
    db.select({ n: count() }).from(serverError).where(eq(serverError.status, 'new')),
    db.select({ n: count() }).from(problemReport).where(eq(problemReport.status, 'open')),
    openComplaints(db),
  ]);
  return { errors: Number(errors.n), reports: Number(reports.n), complaints };
}
