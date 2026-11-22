import { INBOX_MAX, INBOX_QUOTE_MAX, type InboxItem, type InboxPage } from '@quiz/shared';
import { and, count, desc, eq, isNull, lte } from 'drizzle-orm';
import type { Db } from './db/client';
import { inboxItem, problemReport, pushBroadcast } from './db/schema';
import { truncateChars } from './error-mask';

/**
 * «Вхідні» (70): розсилки адміна й відповіді на «Щось не працює». Рядок inbox_item лише посилається
 * на розсилку чи скаргу — текст береться з'єднанням. Елементи людина не видаляє; показ — INBOX_MAX найновіших.
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Скільки рядків в одній вставці розсилки. */
const BATCH = 500;

export async function inboxPage(db: Db, userId: string): Promise<InboxPage> {
  const rows = await db
    .select({
      id: inboxItem.id,
      kind: inboxItem.kind,
      at: inboxItem.createdAt,
      readAt: inboxItem.readAt,
      title: pushBroadcast.title,
      text: pushBroadcast.text,
      url: pushBroadcast.url,
      problemId: problemReport.id,
      problemAt: problemReport.createdAt,
      problemText: problemReport.text,
      reply: problemReport.reply,
    })
    .from(inboxItem)
    .leftJoin(pushBroadcast, eq(pushBroadcast.id, inboxItem.broadcastId))
    .leftJoin(problemReport, eq(problemReport.id, inboxItem.problemId))
    .where(eq(inboxItem.userId, userId))
    .orderBy(desc(inboxItem.createdAt), desc(inboxItem.id))
    .limit(INBOX_MAX);
  const items: InboxItem[] = [];
  for (const row of rows) {
    const base = { id: row.id, at: row.at.toISOString(), read: row.readAt !== null };
    if (row.kind === 'broadcast' && row.title !== null && row.text !== null) {
      items.push({ ...base, kind: 'broadcast', title: row.title, text: row.text, url: row.url });
    } else if (row.kind === 'problem_reply' && row.problemId !== null && row.problemAt !== null && row.problemText !== null && row.reply !== null) {
      items.push({
        ...base,
        kind: 'problem_reply',
        reply: row.reply,
        problem: { id: row.problemId, at: row.problemAt.toISOString(), text: truncateChars(row.problemText, INBOX_QUOTE_MAX) },
      });
    }
  }
  return { items, unread: await inboxUnread(db, userId) };
}

export async function inboxUnread(db: Db | Tx, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(inboxItem).where(and(eq(inboxItem.userId, userId), isNull(inboxItem.readAt)));
  return Number(row?.n ?? 0);
}

/** Свої непрочитані, не новіші за upTo, — прочитані в мить now; повертає, скільки непрочитаних лишилося. */
export async function markInboxRead(db: Db, input: { userId: string; upTo: Date; now: Date }): Promise<number> {
  await db
    .update(inboxItem)
    .set({ readAt: input.now })
    .where(and(eq(inboxItem.userId, input.userId), isNull(inboxItem.readAt), lte(inboxItem.createdAt, input.upTo)));
  return inboxUnread(db, input.userId);
}

/** Відповідь адміна у «Вхідні» автора; одна скарга — один рядок. */
export async function addProblemReply(tx: Db | Tx, input: { userId: string; problemId: string; now: Date }): Promise<void> {
  await tx.insert(inboxItem).values({ userId: input.userId, kind: 'problem_reply', problemId: input.problemId, createdAt: input.now }).onConflictDoNothing();
}

/** Розсилка у «Вхідні» кожного адресата, пачками; повтор людини чи розсилки нічого не дублює. */
export async function addBroadcast(tx: Db | Tx, input: { broadcastId: string; userIds: readonly string[]; now: Date }): Promise<void> {
  const ids = [...new Set(input.userIds)];
  for (let start = 0; start < ids.length; start += BATCH) {
    const chunk = ids.slice(start, start + BATCH);
    await tx
      .insert(inboxItem)
      .values(chunk.map((userId) => ({ userId, kind: 'broadcast' as const, broadcastId: input.broadcastId, createdAt: input.now })))
      .onConflictDoNothing();
  }
}
