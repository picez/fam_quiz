import { ADMIN_PAGE_SIZE, adminPages, pageOffset, type AdminFeedKind, type AdminFeedRow, type AdminList } from '@quiz/shared';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { feedEvent, profile, userLike } from './db/schema';
import { eventLikes } from './feed-store';
import type { Fail } from './calendar-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 63: усі події стрічки для адміна (і приховані, і заблокованих авторів), at desc, id desc; likes — групові запити на всю сторінку (eventLikes), прихованим — 0. */
export async function adminFeed(db: Db, query: { page: number; user?: string; kind?: AdminFeedKind }): Promise<AdminList<AdminFeedRow>> {
  const where: SQL | undefined = and(
    query.user === undefined ? undefined : eq(feedEvent.userId, query.user),
    query.kind === undefined ? undefined : eq(feedEvent.kind, query.kind),
  );
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(feedEvent).where(where);
  const total = Number(n ?? 0);
  const rows = await db
    .select({ event: feedEvent, nickname: profile.nickname })
    .from(feedEvent)
    .leftJoin(profile, eq(profile.userId, feedEvent.userId))
    .where(where)
    .orderBy(desc(feedEvent.at), desc(feedEvent.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset(pageOffset(query.page, ADMIN_PAGE_SIZE));
  // Лічильники — тим самим запитом, що й під подіями стрічки (eventLikes); viewer порожній: «liked» адміну не потрібне.
  const likesOf = await eventLikes(db, '', rows.map((r) => r.event).filter((e) => e.hiddenAt === null));
  return {
    rows: rows.map(({ event, nickname }) => ({
      id: event.id,
      at: event.at.toISOString(),
      who: { id: event.userId, nickname },
      data: event.data,
      likes: event.hiddenAt === null ? likesOf(event).count : 0,
      hidden: event.hiddenAt === null ? null : { at: event.hiddenAt.toISOString() },
    })),
    total,
    page: query.page,
    pages: adminPages(total),
  };
}

type EventRow = typeof feedEvent.$inferSelect;

/** Вподобайки, що висять під подією: event — за ключем; game — ще й лайки гравцю цієї гри (так їх рахує стрічка). */
function likesUnder(event: EventRow): SQL {
  const byKey = sql`(${userLike.kind} = 'event' and ${userLike.eventKey} = ${event.key})`;
  if (event.kind !== 'game' || event.gameId === null) return byKey;
  const player = sql`(${userLike.kind} = 'player' and ${userLike.gameId} = ${event.gameId} and ${userLike.targetUserId} = ${event.userId})`;
  return sql`(${byKey} or ${player})`;
}

/** 63: «Сховати»/«Показати» подію стрічки разом з вподобайками під нею; одна транзакція з журналом; без зміни — changed: false і без рядка журналу. */
export async function setFeedHidden(
  db: Db,
  input: { adminId: string; eventId: string; hidden: boolean; now: Date },
): Promise<{ ok: true; changed: boolean } | Fail<'not_found'>> {
  if (!UUID.test(input.eventId)) return { ok: false, error: 'not_found' };
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(feedEvent).where(eq(feedEvent.id, input.eventId)).for('update');
    if (!event) return { ok: false as const, error: 'not_found' as const };
    if ((event.hiddenAt !== null) === input.hidden) return { ok: true as const, changed: false };
    await tx
      .update(feedEvent)
      .set({ hiddenAt: input.hidden ? input.now : null })
      .where(eq(feedEvent.id, event.id));
    // hidden для event/player більше ніхто не ставить, тож «Показати» безпечно повертає false тим самим рядкам.
    await tx.update(userLike).set({ hidden: input.hidden }).where(likesUnder(event));
    await logAction(tx, {
      adminId: input.adminId,
      kind: input.hidden ? 'feed_hide' : 'feed_show',
      targetUserId: event.userId,
      details: { feed: event.data },
      now: input.now,
    });
    return { ok: true as const, changed: true };
  });
}
