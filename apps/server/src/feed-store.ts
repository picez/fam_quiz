import { FEED_BADGE_CAP, FEED_PAGE_SIZE, FEED_RETENTION_DAYS, feedCursor, type FeedBadge, type FeedEvent, type FeedPage } from '@quiz/shared';
import { and, eq, inArray, isNotNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Db } from './db/client';
import { feedEvent, follow, game, profile, userLike } from './db/schema';
import { ensureProfile } from './profiles';

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Види лайків, що стають картками «вподобав(-ла) твоє…»; event — ні (лайки на лайки). */
const LIKE_CARD_KINDS = ['question', 'quiz', 'host', 'player'] as const;

type Cursor = { at: Date; id: string };

/** Мітка до мілісекунд: курсор — ISO з мілісекундами, тож і порівнюємо, і сортуємо так само. */
const ms = (value: SQL | AnyPgColumn) => sql`date_trunc('milliseconds', ${value})`;
const iso = (date: Date) => sql`${date.toISOString()}::timestamptz`;

/** Межа зберігання: now − FEED_RETENTION_DAYS. */
export function feedCutoff(now: Date): Date {
  return new Date(now.getTime() - FEED_RETENTION_DAYS * DAY_MS);
}

/** Підзапит id тих, кого я додав і хто додав мене. */
export function mutualFriendIds(db: Db, viewerId: string): SQL {
  const back = alias(follow, 'back');
  const query = db
    .select({ id: follow.followeeId })
    .from(follow)
    .innerJoin(back, and(eq(back.followerId, follow.followeeId), eq(back.followeeId, follow.followerId)))
    .where(eq(follow.followerId, viewerId));
  return sql`${query}`;
}

/** Єдина точка приховування людей (бан #23 допише сюди): зараз sql`true`. */
export function notHidden(column: AnyPgColumn): SQL {
  void column;
  return sql`true`;
}

/** feed_event, які бачить viewer: свої чи взаємних друзів, notHidden(user_id), at >= cutoff. */
export function feedVisibility(db: Db, viewerId: string, now: Date): SQL {
  return sql`((${feedEvent.userId} = ${viewerId} or ${feedEvent.userId} in ${mutualFriendIds(db, viewerId)}) and ${notHidden(feedEvent.userId)} and ${feedEvent.at} >= ${iso(feedCutoff(now))})`;
}

/** (мітка до мс, id побайтно) нижче курсора. */
const below = (at: SQL, id: SQL, cursor: Cursor) => sql`(${at}, ${id}) < (${iso(cursor.at)}, ${cursor.id}::text collate "C")`;

async function eventRows(db: Db, viewerId: string, cursor: Cursor | null, now: Date) {
  const at = ms(feedEvent.at);
  const id = sql`${feedEvent.id}::text collate "C"`;
  return db
    .select({ event: feedEvent, nickname: profile.nickname, avatar: profile.avatar })
    .from(feedEvent)
    .innerJoin(profile, eq(profile.userId, feedEvent.userId))
    .where(and(feedVisibility(db, viewerId, now), cursor ? below(at, id, cursor) : undefined))
    .orderBy(sql`${at} desc`, sql`${id} desc`)
    .limit(FEED_PAGE_SIZE + 1);
}

async function likeGroups(db: Db, viewerId: string, cursor: Cursor | null, now: Date) {
  const first = sql`min(${userLike.createdAt})`;
  const at = ms(first);
  const id = sql`('like:' || ${userLike.gameId}::text || ':' || ${userLike.userId}) collate "C"`;
  return db
    .select({
      userId: userLike.userId,
      gameId: sql<string>`${userLike.gameId}::text`,
      at: sql<Date>`${first}`.mapWith(userLike.createdAt),
      questions: sql<number>`(count(*) filter (where ${userLike.kind} = 'question'))::int`,
      quiz: sql<boolean>`bool_or(${userLike.kind} = 'quiz')`,
      host: sql<boolean>`bool_or(${userLike.kind} = 'host')`,
      player: sql<boolean>`bool_or(${userLike.kind} = 'player')`,
      title: game.title,
      nickname: profile.nickname,
      avatar: profile.avatar,
    })
    .from(userLike)
    .innerJoin(profile, eq(profile.userId, userLike.userId))
    .leftJoin(game, eq(game.id, userLike.gameId))
    .where(
      and(
        eq(userLike.targetUserId, viewerId),
        inArray(userLike.kind, [...LIKE_CARD_KINDS]),
        eq(userLike.hidden, false),
        isNotNull(userLike.gameId),
        sql`${userLike.createdAt} >= ${iso(feedCutoff(now))}`,
        ne(userLike.userId, viewerId),
        notHidden(userLike.userId),
      ),
    )
    .groupBy(userLike.userId, userLike.gameId, game.title, profile.nickname, profile.avatar)
    .having(cursor ? below(at, id, cursor) : undefined)
    .orderBy(sql`${at} desc`, sql`${id} desc`)
    .limit(FEED_PAGE_SIZE + 1);
}

/** Лічильники ❤️ під подіями сторінки: два групові запити на всю сторінку. */
async function eventLikes(db: Db, viewerId: string, events: (typeof feedEvent.$inferSelect)[]) {
  const games = events.filter((e) => e.kind === 'game' && e.gameId !== null);
  const others = events.filter((e) => e.kind !== 'game');
  const players = new Map<string, { count: number; liked: boolean }>();
  const byKey = new Map<string, { count: number; liked: boolean }>();

  if (games.length > 0) {
    const rows = await db
      .select({
        gameId: sql<string>`${userLike.gameId}::text`,
        target: userLike.targetUserId,
        count: sql<number>`count(*)::int`,
        liked: sql<boolean>`bool_or(${userLike.userId} = ${viewerId})`,
      })
      .from(userLike)
      .where(
        and(
          eq(userLike.kind, 'player'),
          eq(userLike.hidden, false),
          inArray(userLike.gameId, [...new Set(games.map((e) => e.gameId as string))]),
          inArray(userLike.targetUserId, [...new Set(games.map((e) => e.userId))]),
        ),
      )
      .groupBy(userLike.gameId, userLike.targetUserId);
    for (const row of rows) players.set(`${row.gameId}|${row.target}`, { count: row.count, liked: row.liked });
  }
  if (others.length > 0) {
    const rows = await db
      .select({
        key: sql<string>`${userLike.eventKey}`,
        count: sql<number>`count(*)::int`,
        liked: sql<boolean>`bool_or(${userLike.userId} = ${viewerId})`,
      })
      .from(userLike)
      .where(and(eq(userLike.kind, 'event'), eq(userLike.hidden, false), inArray(userLike.eventKey, others.map((e) => e.key))))
      .groupBy(userLike.eventKey);
    for (const row of rows) byKey.set(row.key, { count: row.count, liked: row.liked });
  }

  return (event: typeof feedEvent.$inferSelect) => {
    const found = event.kind === 'game' ? players.get(`${event.gameId}|${event.userId}`) : byKey.get(event.key);
    const mine = event.userId === viewerId;
    return { count: found?.count ?? 0, liked: !mine && (found?.liked ?? false) };
  };
}

/** Порядок сторінки: (at desc, id desc), id побайтно, як collate "C". */
function newerFirst(a: FeedEvent, b: FeedEvent): number {
  if (a.at !== b.at) return a.at > b.at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

/** Сторінка: feed_event (feedVisibility) і групи лайків мені (user_like, notHidden(user_like.user_id)), злиті за (at desc, id desc). */
export async function feedPage(db: Db, viewerId: string, cursor: Cursor | null, now: Date): Promise<FeedPage> {
  const [rows, groups] = await Promise.all([eventRows(db, viewerId, cursor, now), likeGroups(db, viewerId, cursor, now)]);

  const merged: FeedEvent[] = [
    ...rows.map(({ event, nickname, avatar }) => ({
      id: event.id,
      at: event.at.toISOString(),
      who: { id: event.userId, nickname, avatar },
      mine: event.userId === viewerId,
      data: event.data,
      likes: null as FeedEvent['likes'],
    })),
    ...groups.map(
      (g): FeedEvent => ({
        id: `like:${g.gameId}:${g.userId}`,
        at: g.at.toISOString(),
        who: { id: g.userId, nickname: g.nickname, avatar: g.avatar },
        mine: true,
        data: { kind: 'like', title: g.title, questions: g.questions, quiz: g.quiz, host: g.host, player: g.player },
        likes: null,
      }),
    ),
  ].sort(newerFirst);

  const shown = merged.slice(0, FEED_PAGE_SIZE);
  const shownIds = new Set(shown.map((e) => e.id));
  const likesOf = await eventLikes(
    db,
    viewerId,
    rows.map((r) => r.event).filter((e) => shownIds.has(e.id)),
  );
  const byId = new Map(rows.map((r) => [r.event.id, r.event]));
  for (const item of shown) {
    const source = byId.get(item.id);
    if (source) item.likes = likesOf(source);
  }

  const page: FeedPage = {
    events: shown,
    next: merged.length > FEED_PAGE_SIZE ? feedCursor(shown[shown.length - 1]) : null,
  };
  if (cursor === null) page.asOf = now.toISOString();
  return page;
}

/** events — чужі видимі з created_at > feed_seen_at, до FEED_BADGE_CAP + 1; requests / decisions = 0 (// 21: календар). */
export async function feedBadge(db: Db, viewerId: string, now: Date): Promise<FeedBadge> {
  const seen = sql`coalesce((select ${profile.feedSeenAt} from ${profile} where ${profile.userId} = ${viewerId}), '-infinity'::timestamptz)`;
  const capped = db
    .select({ one: sql`1` })
    .from(feedEvent)
    .innerJoin(profile, eq(profile.userId, feedEvent.userId))
    .where(and(feedVisibility(db, viewerId, now), ne(feedEvent.userId, viewerId), sql`${ms(feedEvent.createdAt)} > ${seen}`))
    .limit(FEED_BADGE_CAP + 1)
    .as('capped');
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(capped);
  // 21: календар — запити до моїх подій і рішення за моїми запитами.
  return { events: row?.n ?? 0, requests: 0, decisions: 0 };
}

/** feed_seen_at = greatest(coalesce(feed_seen_at, '-infinity'), least(upTo, now)); ensureProfile. */
export async function markFeedSeen(db: Db, viewerId: string, upTo: Date, now: Date): Promise<void> {
  if (Number.isNaN(upTo.getTime())) return;
  if ((await ensureProfile(db, viewerId)) === null) return;
  const mark = upTo.getTime() > now.getTime() ? now : upTo;
  await db
    .update(profile)
    .set({ feedSeenAt: sql`greatest(coalesce(${profile.feedSeenAt}, '-infinity'::timestamptz), ${iso(mark)})` })
    .where(eq(profile.userId, viewerId));
}

/** Видимий feed_event за id (uuid) або null. */
export async function visibleEvent(db: Db, viewerId: string, eventId: string, now: Date): Promise<typeof feedEvent.$inferSelect | null> {
  if (!UUID.test(eventId)) return null;
  const [row] = await db
    .select()
    .from(feedEvent)
    .where(and(eq(feedEvent.id, eventId), feedVisibility(db, viewerId, now)));
  return row ?? null;
}

/** Видаляє feed_event з at < cutoff; повертає кількість. */
export async function pruneFeed(db: Db, now: Date): Promise<number> {
  const removed = await db.delete(feedEvent).where(lt(feedEvent.at, feedCutoff(now))).returning({ id: feedEvent.id });
  return removed.length;
}
