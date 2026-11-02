import type { AdminActionKind, AdminLogDetails } from '@quiz/shared';
import { AsyncLocalStorage } from 'node:async_hooks';
import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { adminAction, session, user, userBan } from './db/schema';
import { ensureProfile } from './profiles';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Прапорець «вхід відхилено баном» для поточного запиту до Better Auth (задача 3). */
export const banNotice = new AsyncLocalStorage<{ banned: boolean }>();

export async function isBanned(db: Db | Tx, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: userBan.userId }).from(userBan).where(eq(userBan.userId, userId));
  return row !== undefined;
}

/** Рядок журналу; adminLabel — нікнейм адміна (ensureProfile), targetLabel — нікнейм цілі чи ''. */
export async function logAction(
  tx: Db | Tx,
  entry: { adminId: string; kind: AdminActionKind; targetUserId: string | null; details: AdminLogDetails; now: Date },
): Promise<void> {
  const admin = await ensureProfile(tx as Db, entry.adminId);
  const target = entry.targetUserId === null ? null : await ensureProfile(tx as Db, entry.targetUserId);
  await tx.insert(adminAction).values({
    at: entry.now,
    adminId: entry.adminId,
    adminLabel: admin?.nickname ?? '',
    kind: entry.kind,
    targetUserId: entry.targetUserId,
    targetLabel: target?.nickname ?? '',
    details: entry.details,
  });
}

/** Транзакція: insert user_ban on conflict do nothing; якщо вставлено — delete session where user_id, logAction('ban', { reason }). Немає користувача → not_found. */
export async function banUser(
  db: Db,
  input: { adminId: string; targetId: string; reason: string | null; now: Date },
): Promise<{ ok: true; changed: boolean } | { ok: false; error: 'not_found' }> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: user.id }).from(user).where(eq(user.id, input.targetId));
    if (!target) return { ok: false as const, error: 'not_found' as const };
    const inserted = await tx
      .insert(userBan)
      .values({ userId: input.targetId, reason: input.reason, bannedBy: input.adminId, bannedAt: input.now })
      .onConflictDoNothing()
      .returning({ id: userBan.userId });
    if (inserted.length === 0) return { ok: true as const, changed: false };
    await tx.delete(session).where(eq(session.userId, input.targetId));
    await logAction(tx, { adminId: input.adminId, kind: 'ban', targetUserId: input.targetId, details: { reason: input.reason }, now: input.now });
    return { ok: true as const, changed: true };
  });
}

/** Транзакція: delete user_ban returning; якщо було — logAction('unban'). */
export async function unbanUser(db: Db, input: { adminId: string; targetId: string; now: Date }): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    const removed = await tx.delete(userBan).where(eq(userBan.userId, input.targetId)).returning({ id: userBan.userId });
    if (removed.length === 0) return { changed: false };
    await logAction(tx, { adminId: input.adminId, kind: 'unban', targetUserId: input.targetId, details: {}, now: input.now });
    return { changed: true };
  });
}
