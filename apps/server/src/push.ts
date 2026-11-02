import { PUSH_REMINDER_BEFORE_MS, PUSH_TICK_MS, type CalendarRequestStatus, type PushPayload } from '@quiz/shared';
import { and, eq, inArray, isNotNull, isNull, lte, gt, sql } from 'drizzle-orm';
import type { CalendarNotify } from './calendar-routes';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, follow, game } from './db/schema';
import { notHidden } from './feed-store';
import { dropEndpoint, subscriptionsOf } from './push-store';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushOptions {
  ttl: number;
  urgency: 'normal' | 'high';
}
/** Відправник: статус відповіді push-сервісу (201 — ок, 404/410 — підписка мертва). Кидати не повинен; мережева помилка → status 0. */
export type PushSend = (target: PushTarget, payload: string, options: PushOptions) => Promise<{ status: number }>;

export const PUSH_TTL = { reminder: 3600, opened: 21_600, cancelled: 86_400 } as const;

export interface PushService {
  readonly publicKey: string;
  /** Надіслати payload усім підпискам людей; 404/410 → dropEndpoint; повертає кількість спроб. */
  deliver(userIds: string[], payload: PushPayload): Promise<number>;
  /** Для calendar-routes: opened — approved (раз на подію, opened_pushed_at); cancelled — pending + approved. Обидва fire-and-forget. */
  readonly calendarNotify: CalendarNotify;
  /** Позначає reminded_at атомарно й шле reminder ведучому + approved; повертає кількість нагаданих подій. */
  remindDue(now: Date): Promise<number>;
  /** Дочекатися відправок у польоті (для тестів і shutdown). */
  idle(): Promise<void>;
}

/** Люди з потрібним статусом запиту, яких ведучий досі має в друзях (як у видимості 19a). */
async function participants(db: Db, eventId: string, hostId: string, statuses: CalendarRequestStatus[]): Promise<string[]> {
  const rows = await db
    .select({ userId: calendarRequest.userId })
    .from(calendarRequest)
    .where(
      and(
        eq(calendarRequest.eventId, eventId),
        inArray(calendarRequest.status, statuses),
        sql`exists (select 1 from ${follow} where ${follow.followerId} = ${hostId} and ${follow.followeeId} = ${calendarRequest.userId})`,
        // Заблокованим (бан #23) пушів не шлемо.
        notHidden(calendarRequest.userId),
      ),
    );
  return rows.map((r) => r.userId);
}

export function createPushService(deps: {
  db: Db;
  publicKey: string;
  send: PushSend;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}): PushService {
  const { db, send } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const inFlight = new Set<Promise<unknown>>();

  async function deliver(userIds: string[], payload: PushPayload): Promise<number> {
    const subs = await subscriptionsOf(db, userIds);
    if (subs.length === 0) return 0;
    const body = JSON.stringify(payload);
    const options: PushOptions = { ttl: PUSH_TTL[payload.kind], urgency: payload.kind === 'cancelled' ? 'normal' : 'high' };
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const { status } = await send({ endpoint: sub.endpoint, keys: sub.keys }, body, options);
          if (status === 404 || status === 410) await dropEndpoint(db, sub.endpoint);
          else if (status < 200 || status >= 300) log(`push ${payload.kind} answered ${status}`);
        } catch (error) {
          log('push send failed', error);
        }
      }),
    );
    return subs.length;
  }

  /** Обіцянка в набір для idle(); помилка — у log, не назовні. */
  function track(work: Promise<unknown>): void {
    const tracked: Promise<unknown> = work
      .catch((error: unknown) => log('push notify failed', error))
      .finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
  }

  async function opened(eventId: string): Promise<void> {
    const [claimed] = await db
      .update(calendarEvent)
      .set({ openedPushedAt: now() })
      .where(
        and(
          eq(calendarEvent.id, eventId),
          isNull(calendarEvent.openedPushedAt),
          isNull(calendarEvent.cancelledAt),
          isNotNull(calendarEvent.gameCode),
          notHidden(calendarEvent.hostId),
        ),
      )
      .returning({ id: calendarEvent.id, hostId: calendarEvent.hostId, title: calendarEvent.title, code: calendarEvent.gameCode });
    if (claimed === undefined || claimed.code === null) return;
    const to = await participants(db, claimed.id, claimed.hostId, ['approved']);
    await deliver(to, { kind: 'opened', eventId: claimed.id, title: claimed.title, code: claimed.code });
  }

  async function cancelled(eventId: string): Promise<void> {
    const [found] = await db
      .select({ hostId: calendarEvent.hostId, title: calendarEvent.title, startsAt: calendarEvent.startsAt })
      .from(calendarEvent)
      .where(eq(calendarEvent.id, eventId));
    if (found === undefined) return;
    const to = await participants(db, eventId, found.hostId, ['pending', 'approved']);
    await deliver(to, { kind: 'cancelled', eventId, title: found.title, startsAt: found.startsAt.toISOString() });
  }

  async function remindDue(at: Date): Promise<number> {
    const claimed = await db
      .update(calendarEvent)
      .set({ remindedAt: at })
      .where(
        and(
          isNull(calendarEvent.cancelledAt),
          isNull(calendarEvent.remindedAt),
          // Після «Гра почалась» нагадування з тим самим тегом замінило б його.
          isNull(calendarEvent.openedPushedAt),
          gt(calendarEvent.startsAt, at),
          lte(calendarEvent.startsAt, new Date(at.getTime() + PUSH_REMINDER_BEFORE_MS)),
          sql`not exists (select 1 from ${game} where ${game.id} = ${calendarEvent.gameId} and ${game.status} = 'finished')`,
          // Подія заблокованого ведучого (бан #23) нікому не нагадує.
          notHidden(calendarEvent.hostId),
        ),
      )
      .returning({ id: calendarEvent.id, hostId: calendarEvent.hostId, title: calendarEvent.title, startsAt: calendarEvent.startsAt });
    for (const ev of claimed) {
      try {
        const to = [ev.hostId, ...(await participants(db, ev.id, ev.hostId, ['approved']))];
        await deliver(to, { kind: 'reminder', eventId: ev.id, title: ev.title, startsAt: ev.startsAt.toISOString() });
      } catch (error) {
        log('push reminder failed', error);
      }
    }
    return claimed.length;
  }

  return {
    publicKey: deps.publicKey,
    deliver,
    calendarNotify: {
      opened: (eventId) => track(opened(eventId)),
      cancelled: (eventId) => track(cancelled(eventId)),
    },
    remindDue(at) {
      // У наборі для idle(), щоб shutdown дочекався прогону тікера; помилку бачить лише викликач (без подвійного логу).
      const run = remindDue(at);
      track(run.catch(() => undefined));
      return run;
    },
    async idle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
  };
}

/** Перший прогін одразу, далі кожні everyMs; unref; повертає stop. */
export function startPushReminders(service: PushService, everyMs: number = PUSH_TICK_MS, onError: (e: unknown) => void = () => undefined): () => void {
  const run = () => {
    service.remindDue(new Date()).catch(onError);
  };
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
