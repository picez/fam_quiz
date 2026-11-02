import {
  CALENDAR_LIST_CAP,
  CALENDAR_MAX_AHEAD_DAYS,
  CALENDAR_MISSED_AFTER_MS,
  type CalendarEvent,
  type CalendarInput,
  type CalendarPage,
  type CalendarRequest,
  type CalendarState,
  type FeedData,
} from '@quiz/shared';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { calendarEvent, calendarRequest, feedEvent, follow, game, profile, quiz, user } from './db/schema';
import { notHidden } from './feed-store';
import { getQuiz } from './quizzes';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true — кімната з цим id жива тут і не у finished. */
export type CalendarProbe = (gameId: string, code: string) => boolean;
export const noRooms: CalendarProbe = () => false;

type EventRow = typeof calendarEvent.$inferSelect;
export type Fail<E extends string> = { ok: false; error: E };

const nameOf = sql<string>`coalesce(${profile.nickname}, ${user.name}, '')`;

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

async function selectEvents(db: Db, viewerId: string, extra: SQL | undefined) {
  return db
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
    .where(inArray(calendarRequest.eventId, ids))
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
      .where(inArray(calendarRequest.eventId, hosted))
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
  const selected = await selectEvents(db, viewerId, sql`(${calendarEvent.startsAt} > ${iso(edge)} or ${calendarEvent.gameId} is not null)`);
  const inWindow = selected
    .filter((s) => s.row.startsAt.getTime() > edge.getTime() || calendarState(s.row, now, probe, s.finished) === 'open')
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

/** Вікторина — своя (getQuiz); пише calendar_event і feed_event planned:<id> в одній транзакції. */
export async function createEvent(db: Db, hostId: string, input: CalendarInput, now: Date): Promise<{ ok: true; id: string } | Fail<'quiz_not_found' | 'calendar_time'>> {
  if ((await getQuiz(db, hostId, input.quizId)) === null) return { ok: false, error: 'quiz_not_found' };
  const startsAt = new Date(input.startsAt);
  if (!startsAtAllowed(startsAt, now)) return { ok: false, error: 'calendar_time' };
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
  await db.transaction(async (tx) => {
    await tx.update(calendarEvent).set({ title: input.title, quizId: input.quizId, startsAt, editedAt: now }).where(eq(calendarEvent.id, eventId));
    const data: FeedData = { kind: 'planned', eventId, title: input.title, startsAt: startsAt.toISOString() };
    await tx.update(feedEvent).set({ data }).where(eq(feedEvent.key, plannedKey(eventId)));
  });
  return { ok: true };
}

/** Будь-який стан, крім played; повторне — ok без змін; видаляє рядок planned стрічки. */
export async function cancelEvent(db: Db, hostId: string, eventId: string, now: Date, probe: CalendarProbe): Promise<{ ok: true; changed: boolean } | Fail<'not_found' | 'event_locked'>> {
  const found = await hostedEvent(db, hostId, eventId, now, probe);
  if (found === null) return { ok: false, error: 'not_found' };
  if (found.state === 'played') return { ok: false, error: 'event_locked' };
  if (found.state === 'cancelled') return { ok: true, changed: false };
  await db.transaction(async (tx) => {
    await tx.update(calendarEvent).set({ cancelledAt: now }).where(eq(calendarEvent.id, eventId));
    await tx.delete(feedEvent).where(eq(feedEvent.key, plannedKey(eventId)));
  });
  return { ok: true, changed: true };
}

/** Запам'ятати кімнату події. */
export async function attachGame(db: Db, eventId: string, gameId: string, code: string): Promise<void> {
  await db.update(calendarEvent).set({ gameId, gameCode: code }).where(eq(calendarEvent.id, eventId));
}
