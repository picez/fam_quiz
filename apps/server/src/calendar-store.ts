import {
  CALENDAR_ACTIVE_CAP,
  CALENDAR_LIST_CAP,
  CALENDAR_MAX_AHEAD_DAYS,
  CALENDAR_MISSED_AFTER_MS,
  FEED_BADGE_CAP,
  type CalendarEvent,
  type CalendarInput,
  type CalendarPage,
  type CalendarRequest,
  type CalendarRequestStatus,
  type CalendarState,
  type FeedData,
} from '@quiz/shared';
import { and, asc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, feedEvent, follow, game, profile, quiz, user } from './db/schema';
import { notHidden } from './feed-store';
import { ensureProfile } from './profiles';
import { getQuiz } from './quizzes';

const DAY_MS = 86_400_000;
/** Запас для давніх подій із кімнатою: кімната живе обмежений час, а прикріпити її можна лише до початок + 6 год. */
const OPEN_GRACE_MS = 48 * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true — кімната з цим id жива тут і не у finished. */
export type CalendarProbe = (gameId: string, code: string) => boolean;
export const noRooms: CalendarProbe = () => false;

type EventRow = typeof calendarEvent.$inferSelect;
export type Fail<E extends string> = { ok: false; error: E };

const nameOf = sql<string>`coalesce(${profile.nickname}, '')`;

/** Чиста функція: перша умова, що справдилась, перемагає. */
export function calendarState(
  row: Pick<EventRow, 'cancelledAt' | 'startsAt' | 'gameId' | 'gameCode'>,
  now: Date,
  probe: CalendarProbe,
  finished: boolean,
): CalendarState {
  if (row.cancelledAt !== null) return 'cancelled';
  if (finished) return 'played';
  if (row.gameId !== null && row.gameCode !== null && probe(row.gameId, row.gameCode)) return 'open';
  if (now.getTime() >= row.startsAt.getTime() + CALENDAR_MISSED_AFTER_MS) return 'missed';
  return 'planned';
}

/** now < startsAt <= now + CALENDAR_MAX_AHEAD_DAYS. */
export function startsAtAllowed(startsAt: Date, now: Date): boolean {
  const t = startsAt.getTime();
  return t > now.getTime() && t <= now.getTime() + CALENDAR_MAX_AHEAD_DAYS * DAY_MS;
}

/** host = viewer або host має viewer у друзях; notHidden(host). */
export function calendarVisibility(viewerId: string): SQL {
  return sql`((${calendarEvent.hostId} = ${viewerId} or exists (select 1 from ${follow} where ${follow.followerId} = ${calendarEvent.hostId} and ${follow.followeeId} = ${viewerId})) and ${notHidden(calendarEvent.hostId)})`;
}

/** Скасовану бачать лише ведучий і ті, хто мав pending/approved. */
function cancelledVisibility(viewerId: string): SQL {
  return sql`(${calendarEvent.cancelledAt} is null or ${calendarEvent.hostId} = ${viewerId} or exists (select 1 from ${calendarRequest} where ${calendarRequest.eventId} = ${calendarEvent.id} and ${calendarRequest.userId} = ${viewerId} and ${calendarRequest.status} in ('pending', 'approved')))`;
}

const iso = (date: Date) => sql`${date.toISOString()}::timestamptz`;

async function selectEvents(db: Db, viewerId: string, extra: SQL | undefined, limit?: number) {
  const query = db
    .select({
      row: calendarEvent,
      nickname: nameOf,
      avatar: profile.avatar,
      quizTitle: quiz.title,
      finished: sql<boolean>`coalesce(${game.status} = 'finished', false)`,
    })
    .from(calendarEvent)
    .innerJoin(user, eq(user.id, calendarEvent.hostId))
    .leftJoin(profile, eq(profile.userId, calendarEvent.hostId))
    .leftJoin(quiz, eq(quiz.id, calendarEvent.quizId))
    .leftJoin(game, eq(game.id, calendarEvent.gameId))
    .where(and(calendarVisibility(viewerId), cancelledVisibility(viewerId), extra))
    .orderBy(asc(calendarEvent.startsAt), asc(calendarEvent.id));
  return limit === undefined ? query : query.limit(limit);
}

type Selected = Awaited<ReturnType<typeof selectEvents>>;

/** Єдиний шлях збирання CalendarEvent: лічильники, мій запит і (ведучому) список запитів — запитами на всю сторінку. */
async function toCalendarEvents(db: Db, viewerId: string, selected: Selected, now: Date, probe: CalendarProbe): Promise<CalendarEvent[]> {
  if (selected.length === 0) return [];
  const ids = selected.map((s) => s.row.id);
  const hosted = selected.filter((s) => s.row.hostId === viewerId).map((s) => s.row.id);

  const counts = await db
    .select({ eventId: calendarRequest.eventId, n: sql<number>`(count(*) filter (where ${calendarRequest.status} = 'approved'))::int` })
    .from(calendarRequest)
    .where(and(inArray(calendarRequest.eventId, ids), notHidden(calendarRequest.userId)))
    .groupBy(calendarRequest.eventId);
  const mine = await db
    .select({ eventId: calendarRequest.eventId, status: calendarRequest.status })
    .from(calendarRequest)
    .where(and(inArray(calendarRequest.eventId, ids), eq(calendarRequest.userId, viewerId)));
  const approved = new Map(counts.map((c) => [c.eventId, c.n]));
  const myStatus = new Map(mine.map((m) => [m.eventId, m.status]));

  const requests = new Map<string, CalendarRequest[]>();
  if (hosted.length > 0) {
    const rows = await db
      .select({
        eventId: calendarRequest.eventId,
        userId: calendarRequest.userId,
        status: calendarRequest.status,
        requestedAt: calendarRequest.requestedAt,
        nickname: nameOf,
        avatar: profile.avatar,
      })
      .from(calendarRequest)
      .innerJoin(user, eq(user.id, calendarRequest.userId))
      .leftJoin(profile, eq(profile.userId, calendarRequest.userId))
      .where(and(inArray(calendarRequest.eventId, hosted), notHidden(calendarRequest.userId)))
      .orderBy(sql`(${calendarRequest.status} = 'pending') desc`, asc(calendarRequest.requestedAt), asc(calendarRequest.userId));
    for (const r of rows) {
      const list = requests.get(r.eventId) ?? [];
      list.push({ user: { id: r.userId, nickname: r.nickname, avatar: r.avatar }, status: r.status, at: r.requestedAt.toISOString() });
      requests.set(r.eventId, list);
    }
  }

  return selected.map(({ row, nickname, avatar, quizTitle, finished }) => {
    const isHost = row.hostId === viewerId;
    const state = calendarState(row, now, probe, finished);
    const my = isHost ? null : (myStatus.get(row.id) ?? null);
    return {
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      host: { id: row.hostId, nickname, avatar },
      mine: isHost,
      quiz: { id: isHost ? row.quizId : null, title: quizTitle },
      state,
      editedAt: row.editedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      approved: approved.get(row.id) ?? 0,
      myRequest: my,
      requests: isHost ? (requests.get(row.id) ?? []) : null,
      joinCode: state === 'open' && (isHost || my === 'approved') ? row.gameCode : null,
    };
  });
}

/** Вікно календаря (див. «Рішення»), видимі глядачу; скасовані — лише ведучому й тим, хто мав pending/approved. */
export async function listCalendar(db: Db, viewerId: string, now: Date, probe: CalendarProbe): Promise<CalendarPage> {
  const edge = new Date(now.getTime() - CALENDAR_MISSED_AFTER_MS);
  // Майбутні: у вікні за часом, обмежені капом. Давні з кімнатою: лише недавні й не зіграні (кімната зі сховища живе <= 24 год).
  const graceEdge = new Date(edge.getTime() - OPEN_GRACE_MS);
  const [future, old] = await Promise.all([
    selectEvents(db, viewerId, sql`${calendarEvent.startsAt} > ${iso(edge)}`, CALENDAR_LIST_CAP),
    selectEvents(
      db,
      viewerId,
      sql`(${calendarEvent.startsAt} <= ${iso(edge)} and ${calendarEvent.startsAt} > ${iso(graceEdge)} and ${calendarEvent.gameId} is not null and coalesce(${game.status}, '') <> 'finished')`,
    ),
  ]);
  const inWindow = [...future, ...old.filter((x) => calendarState(x.row, now, probe, x.finished) === 'open')]
    .sort((x, y) => x.row.startsAt.getTime() - y.row.startsAt.getTime() || (x.row.id < y.row.id ? -1 : x.row.id > y.row.id ? 1 : 0))
    .slice(0, CALENDAR_LIST_CAP);
  return { events: await toCalendarEvents(db, viewerId, inWindow, now, probe), asOf: now.toISOString() };
}

/** Видима глядачу подія (без вікна) або null. */
export async function calendarEventFor(db: Db, viewerId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<CalendarEvent | null> {
  if (!UUID.test(eventId)) return null;
  const selected = await selectEvents(db, viewerId, eq(calendarEvent.id, eventId));
  const [event] = await toCalendarEvents(db, viewerId, selected, now, probe);
  return event ?? null;
}

/** Сирий рядок ведучого з обчисленим станом; чужа чи не uuid → null. */
export async function hostedEvent(db: Db, hostId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ row: EventRow; state: CalendarState } | null> {
  if (!UUID.test(eventId)) return null;
  const [found] = await db
    .select({ row: calendarEvent, finished: sql<boolean>`coalesce(${game.status} = 'finished', false)` })
    .from(calendarEvent)
    .leftJoin(game, eq(game.id, calendarEvent.gameId))
    .where(and(eq(calendarEvent.id, eventId), eq(calendarEvent.hostId, hostId)));
  if (found === undefined) return null;
  return { row: found.row, state: calendarState(found.row, now, probe, found.finished) };
}

const plannedKey = (eventId: string) => `planned:${eventId}`;

/** Живі майбутні події ведучого: не скасовані й ще не почалися. */
async function activeFutureCount(db: Db, hostId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(calendarEvent)
    .where(and(eq(calendarEvent.hostId, hostId), isNull(calendarEvent.cancelledAt), gt(calendarEvent.startsAt, now)));
  return row?.count ?? 0;
}

/** Вікторина — своя (getQuiz); не більше CALENDAR_ACTIVE_CAP живих майбутніх; пише calendar_event і feed_event planned:<id> в одній транзакції. */
export async function createEvent(
  db: Db,
  hostId: string,
  input: CalendarInput,
  now: Date,
): Promise<{ ok: true; id: string } | Fail<'quiz_not_found' | 'calendar_time' | 'calendar_limit'>> {
  if ((await getQuiz(db, hostId, input.quizId)) === null) return { ok: false, error: 'quiz_not_found' };
  const startsAt = new Date(input.startsAt);
  if (!startsAtAllowed(startsAt, now)) return { ok: false, error: 'calendar_time' };
  // Два одночасні запити можуть разом трохи перевищити межу — прийнято.
  if ((await activeFutureCount(db, hostId, now)) >= CALENDAR_ACTIVE_CAP) return { ok: false, error: 'calendar_limit' };
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(calendarEvent)
      .values({ hostId, title: input.title, quizId: input.quizId, startsAt, createdAt: now })
      .returning({ id: calendarEvent.id });
    const data: FeedData = { kind: 'planned', eventId: row.id, title: input.title, startsAt: startsAt.toISOString() };
    await tx.insert(feedEvent).values({ key: plannedKey(row.id), userId: hostId, kind: 'planned', data, at: now, createdAt: now });
    return row.id;
  });
  return { ok: true, id };
}

/** Лише в стані planned; edited_at = now; оновлює data рядка planned (created_at не чіпає). */
export async function updateEvent(
  db: Db,
  hostId: string,
  eventId: string,
  input: CalendarInput,
  now: Date,
  probe: CalendarProbe,
): Promise<{ ok: true } | Fail<'not_found' | 'quiz_not_found' | 'calendar_time' | 'event_locked'>> {
  const found = await hostedEvent(db, hostId, eventId, now, probe);
  if (found === null) return { ok: false, error: 'not_found' };
  if (found.state !== 'planned') return { ok: false, error: 'event_locked' };
  if ((await getQuiz(db, hostId, input.quizId)) === null) return { ok: false, error: 'quiz_not_found' };
  const startsAt = new Date(input.startsAt);
  if (!startsAtAllowed(startsAt, now)) return { ok: false, error: 'calendar_time' };
  // Рядок planned у стрічці міг уже зникнути (прунінг стрічки 90 днів проти подій на 365 днів уперед): оновлення за ключем тоді нічого не зачепить — прийнято.
  const locked = await db.transaction(async (tx) => {
    const guard = found.row.gameId === null ? sql`${calendarEvent.gameId} is null` : eq(calendarEvent.gameId, found.row.gameId);
    const updated = await tx
      .update(calendarEvent)
      .set({ title: input.title, quizId: input.quizId, startsAt, editedAt: now })
      .where(and(eq(calendarEvent.id, eventId), sql`${calendarEvent.cancelledAt} is null`, guard))
      .returning({ id: calendarEvent.id });
    if (updated.length === 0) return true;
    const data: FeedData = { kind: 'planned', eventId, title: input.title, startsAt: startsAt.toISOString() };
    await tx.update(feedEvent).set({ data }).where(eq(feedEvent.key, plannedKey(eventId)));
    return false;
  });
  if (locked) return { ok: false, error: 'event_locked' };
  return { ok: true };
}

/** Будь-який стан, крім played; повторне — ok без змін; видаляє рядок planned стрічки. */
export async function cancelEvent(db: Db, hostId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ ok: true; changed: boolean } | Fail<'not_found' | 'event_locked'>> {
  const found = await hostedEvent(db, hostId, eventId, now, probe);
  if (found === null) return { ok: false, error: 'not_found' };
  if (found.state === 'played') return { ok: false, error: 'event_locked' };
  if (found.state === 'cancelled') return { ok: true, changed: false };
  const changed = await db.transaction(async (tx) => {
    const done = await tx
      .update(calendarEvent)
      .set({ cancelledAt: now })
      .where(and(eq(calendarEvent.id, eventId), sql`${calendarEvent.cancelledAt} is null`))
      .returning({ id: calendarEvent.id });
    if (done.length === 0) return false;
    await tx.delete(feedEvent).where(eq(feedEvent.key, plannedKey(eventId)));
    return true;
  });
  return { ok: true, changed };
}

/**
 * Запам'ятати кімнату події. Лише для нескасованої; з `seen` — ще й поки вікторина й кімната ті, що бачив викликач.
 * false — подію встигли скасувати чи змінити.
 */
export async function attachGame(
  db: Db,
  eventId: string,
  gameId: string,
  code: string,
  seen?: { quizId: string | null; gameId: string | null },
): Promise<boolean> {
  const conditions = [eq(calendarEvent.id, eventId), sql`${calendarEvent.cancelledAt} is null`];
  if (seen !== undefined) {
    conditions.push(sql`${calendarEvent.quizId} is not distinct from ${seen.quizId}`, sql`${calendarEvent.gameId} is not distinct from ${seen.gameId}`);
  }
  const done = await db
    .update(calendarEvent)
    .set({ gameId, gameCode: code })
    .where(and(...conditions))
    .returning({ id: calendarEvent.id });
  return done.length > 0;
}

/** Видима подія (calendarVisibility; скасована — лише ведучому й тим, хто мав pending/approved) із сирим рядком і обчисленим станом; інакше null. */
async function visibleRow(db: Db, viewerId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ row: EventRow; state: CalendarState } | null> {
  if (!UUID.test(eventId)) return null;
  const [found] = await db
    .select({ row: calendarEvent, finished: sql<boolean>`coalesce(${game.status} = 'finished', false)` })
    .from(calendarEvent)
    .leftJoin(game, eq(game.id, calendarEvent.gameId))
    .where(and(eq(calendarEvent.id, eventId), calendarVisibility(viewerId), cancelledVisibility(viewerId)));
  if (found === undefined) return null;
  return { row: found.row, state: calendarState(found.row, now, probe, found.finished) };
}

/** Видима подія в стані planned|open; не ведучий; ідемпотентно для pending/approved. */
export async function requestToJoin(
  db: Db,
  userId: string,
  eventId: string,
  now: Date,
  probe: CalendarProbe,
): Promise<{ ok: true; status: CalendarRequestStatus } | Fail<'not_found' | 'own_event' | 'event_closed' | 'request_rejected'>> {
  const found = await visibleRow(db, userId, eventId, now, probe);
  if (found === null) return { ok: false, error: 'not_found' };
  if (found.row.hostId === userId) return { ok: false, error: 'own_event' };
  if (found.state !== 'planned' && found.state !== 'open') return { ok: false, error: 'event_closed' };
  await db.insert(calendarRequest).values({ eventId, userId, status: 'pending', requestedAt: now }).onConflictDoNothing();
  const [mine] = await db
    .select({ status: calendarRequest.status })
    .from(calendarRequest)
    .where(and(eq(calendarRequest.eventId, eventId), eq(calendarRequest.userId, userId)));
  if (mine === undefined) return { ok: false, error: 'not_found' };
  if (mine.status === 'rejected') return { ok: false, error: 'request_rejected' };
  return { ok: true, status: mine.status };
}

/** Видаляє лише pending; запиту немає чи подія не видна → not_found. */
export async function withdrawRequest(db: Db, userId: string, eventId: string): Promise<{ ok: true } | Fail<'not_found' | 'request_approved'>> {
  if (!UUID.test(eventId)) return { ok: false, error: 'not_found' };
  const [found] = await db
    .select({ status: calendarRequest.status })
    .from(calendarRequest)
    .innerJoin(calendarEvent, eq(calendarEvent.id, calendarRequest.eventId))
    .where(and(eq(calendarRequest.eventId, eventId), eq(calendarRequest.userId, userId), calendarVisibility(userId)));
  if (found === undefined || found.status === 'rejected') return { ok: false, error: 'not_found' };
  if (found.status === 'approved') return { ok: false, error: 'request_approved' };
  const removed = await db
    .delete(calendarRequest)
    .where(and(eq(calendarRequest.eventId, eventId), eq(calendarRequest.userId, userId), eq(calendarRequest.status, 'pending')))
    .returning({ userId: calendarRequest.userId });
  // Підтвердження встигло між читанням і видаленням.
  return removed.length === 0 ? { ok: false, error: 'request_approved' } : { ok: true };
}

/** Лише ведучий; подія не played / cancelled; status і decided_at = now. */
export async function decideRequest(
  db: Db,
  hostId: string,
  eventId: string,
  userId: string,
  decision: 'approved' | 'rejected',
  now: Date,
  probe: CalendarProbe,
): Promise<{ ok: true } | Fail<'not_found' | 'event_locked'>> {
  const found = await hostedEvent(db, hostId, eventId, now, probe);
  if (found === null) return { ok: false, error: 'not_found' };
  if (found.state === 'played' || found.state === 'cancelled') return { ok: false, error: 'event_locked' };
  const [current] = await db
    .select({ status: calendarRequest.status })
    .from(calendarRequest)
    .where(and(eq(calendarRequest.eventId, eventId), eq(calendarRequest.userId, userId)));
  if (current === undefined) return { ok: false, error: 'not_found' };
  // Те саме рішення вдруге: decided_at не зсуваємо, бейдж не загоряється.
  if (current.status === decision) return { ok: true };
  const updated = await db
    .update(calendarRequest)
    .set({ status: decision, decidedAt: now })
    .where(
      and(
        eq(calendarRequest.eventId, eventId),
        eq(calendarRequest.userId, userId),
        sql`exists (select 1 from ${calendarEvent} where ${calendarEvent.id} = ${calendarRequest.eventId} and ${calendarEvent.cancelledAt} is null)`,
      ),
    )
    .returning({ userId: calendarRequest.userId });
  // Подію скасували між читанням і записом.
  return updated.length === 0 ? { ok: false, error: 'event_locked' } : { ok: true };
}

/** Обидва до FEED_BADGE_CAP + 1; правила — «Рішення → Бейдж». */
export async function calendarBadge(db: Db, viewerId: string, now: Date): Promise<{ requests: number; decisions: number }> {
  const edge = iso(new Date(now.getTime() - CALENDAR_MISSED_AFTER_MS));
  const pending = db
    .select({ one: sql`1` })
    .from(calendarRequest)
    .innerJoin(calendarEvent, eq(calendarEvent.id, calendarRequest.eventId))
    .leftJoin(game, eq(game.id, calendarEvent.gameId))
    .where(
      and(
        eq(calendarEvent.hostId, viewerId),
        eq(calendarRequest.status, 'pending'),
        notHidden(calendarRequest.userId),
        sql`${calendarEvent.cancelledAt} is null`,
        sql`${calendarEvent.startsAt} > ${edge}`,
        sql`coalesce(${game.status} = 'finished', false) = false`,
      ),
    )
    .limit(FEED_BADGE_CAP + 1)
    .as('pending_requests');

  const seen = sql`coalesce((select ${profile.calendarSeenAt} from ${profile} where ${profile.userId} = ${viewerId}), '-infinity'::timestamptz)`;
  const decided = db
    .select({ one: sql`1` })
    .from(calendarRequest)
    .innerJoin(calendarEvent, eq(calendarEvent.id, calendarRequest.eventId))
    .where(
      and(
        eq(calendarRequest.userId, viewerId),
        calendarVisibility(viewerId),
        sql`${calendarEvent.startsAt} > ${edge}`,
        sql`((${calendarRequest.status} in ('pending', 'approved') and (${calendarRequest.decidedAt} > ${seen} or ${calendarEvent.editedAt} > ${seen} or ${calendarEvent.cancelledAt} > ${seen})) or (${calendarRequest.status} = 'rejected' and ${calendarEvent.cancelledAt} is null and ${calendarRequest.decidedAt} > ${seen}))`,
      ),
    )
    .limit(FEED_BADGE_CAP + 1)
    .as('decided_requests');

  const [[requests], [decisions]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(pending),
    db.select({ n: sql<number>`count(*)::int` }).from(decided),
  ]);
  return { requests: requests?.n ?? 0, decisions: decisions?.n ?? 0 };
}

/** calendar_seen_at = greatest(coalesce(…, '-infinity'), least(upTo, now)); ensureProfile. */
export async function markCalendarSeen(db: Db, viewerId: string, upTo: Date, now: Date): Promise<void> {
  if (Number.isNaN(upTo.getTime())) return;
  if ((await ensureProfile(db, viewerId)) === null) return;
  const mark = upTo.getTime() > now.getTime() ? now : upTo;
  await db
    .update(profile)
    .set({ calendarSeenAt: sql`greatest(coalesce(${profile.calendarSeenAt}, '-infinity'::timestamptz), ${iso(mark)})` })
    .where(eq(profile.userId, viewerId));
}
