import type { Announcement, AnnouncementInput } from '@quiz/shared';
import { and, desc, gt, isNull, or } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { announcement } from './db/schema';
import { ttlCache } from './ttl-cache';

type Row = typeof announcement.$inferSelect;

function view(row: Row): Announcement {
  return { id: row.id, text: row.text, url: row.url, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}

/** Найновіше незняте оголошення, чий строк не минув. */
export async function activeAnnouncement(db: Db, now: Date): Promise<Announcement | null> {
  const [row] = await db
    .select()
    .from(announcement)
    .where(and(isNull(announcement.clearedAt), or(isNull(announcement.expiresAt), gt(announcement.expiresAt, now))))
    .orderBy(desc(announcement.createdAt))
    .limit(1);
  return row === undefined ? null : view(row);
}

/** Знімає всі незняті й вставляє новий рядок (новий id: закрите на пристрої з'явиться знову). */
export async function setAnnouncement(db: Db, args: { adminId: string; input: AnnouncementInput; now: Date }): Promise<Announcement> {
  const { adminId, input, now } = args;
  return db.transaction(async (tx) => {
    await tx.update(announcement).set({ clearedAt: now }).where(isNull(announcement.clearedAt));
    const [row] = await tx
      .insert(announcement)
      .values({ text: input.text, url: input.url, expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt), createdBy: adminId, createdAt: now })
      .returning();
    await logAction(tx, { adminId, kind: 'announcement_set', targetUserId: null, details: { text: input.text }, now });
    return view(row!);
  });
}

/** Знімає незняті; якщо серед них було активне — один запис журналу й true. */
export async function clearAnnouncement(db: Db, args: { adminId: string; now: Date }): Promise<boolean> {
  const { adminId, now } = args;
  return db.transaction(async (tx) => {
    const cleared = await tx.update(announcement).set({ clearedAt: now }).where(isNull(announcement.clearedAt)).returning();
    const live = cleared
      .filter((row) => row.expiresAt === null || row.expiresAt > now)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[0];
    if (live === undefined) return false;
    await logAction(tx, { adminId, kind: 'announcement_clear', targetUserId: null, details: { text: live.text }, now });
    return true;
  });
}

export interface AnnouncementCache {
  get(): Promise<Announcement | null>;
  clear(): void;
}

/** Публічне читання на хвилину; закешоване з минулим строком відкидає одразу. */
export function announcementCache(db: Db, clock: () => number, ttlMs = 60_000): AnnouncementCache {
  const cache = ttlCache(() => activeAnnouncement(db, new Date(clock())), ttlMs, clock);
  return {
    async get() {
      const found = await cache.get();
      if (found !== null && found.expiresAt !== null && Date.parse(found.expiresAt) <= clock()) {
        cache.clear();
        return cache.get();
      }
      return found;
    },
    clear: () => cache.clear(),
  };
}
