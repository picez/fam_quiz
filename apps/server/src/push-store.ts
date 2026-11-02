import { PUSH_MAX_SUBSCRIPTIONS, type PushSubscriptionInput } from '@quiz/shared';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { pushSubscription } from './db/schema';

export interface StoredSubscription {
  endpoint: string;
  userId: string;
  keys: { p256dh: string; auth: string };
}

/** Upsert за endpoint (рядок переходить до userId, created_at = now); далі лишає userId щонайбільше PUSH_MAX_SUBSCRIPTIONS найновіших. */
export async function saveSubscription(db: Db, userId: string, input: PushSubscriptionInput, now: Date): Promise<void> {
  const values = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, createdAt: now };
  await db
    .insert(pushSubscription)
    .values({ endpoint: input.endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values });
  const keep = await db
    .select({ endpoint: pushSubscription.endpoint })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .orderBy(desc(pushSubscription.createdAt), desc(pushSubscription.endpoint))
    .limit(PUSH_MAX_SUBSCRIPTIONS);
  await db.delete(pushSubscription).where(
    and(
      eq(pushSubscription.userId, userId),
      notInArray(pushSubscription.endpoint, keep.map((row) => row.endpoint)),
    ),
  );
}

/** Лише where user_id = userId and endpoint = …; true — щось видалено. */
export async function deleteOwnSubscription(db: Db, userId: string, endpoint: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
    .returning({ endpoint: pushSubscription.endpoint });
  return rows.length > 0;
}

/** Для доставки: 404/410 від push-сервісу. */
export async function dropEndpoint(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
}

/** Усі підписки цих людей (порожній масив → []). */
export async function subscriptionsOf(db: Db, userIds: string[]): Promise<StoredSubscription[]> {
  if (userIds.length === 0) return [];
  const rows = await db.select().from(pushSubscription).where(inArray(pushSubscription.userId, userIds));
  return rows.map((row) => ({ endpoint: row.endpoint, userId: row.userId, keys: { p256dh: row.p256dh, auth: row.auth } }));
}
