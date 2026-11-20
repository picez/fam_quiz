import {
  BROADCAST_DAY_MAX,
  BROADCAST_DAY_MS,
  BROADCAST_GAP_MS,
  BROADCAST_HISTORY,
  BROADCAST_STALE_MS,
  type AdminBroadcast,
  type AdminBroadcastLimits,
  type AdminBroadcastTo,
  type BroadcastInput,
  type BroadcastRecipients,
} from '@quiz/shared';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { logAction } from './bans';
import { recipientsFor } from './bot-plan-store';
import type { Db } from './db/client';
import { familyGroup, profile, pushBroadcast, pushSubscription, user } from './db/schema';
import { notHidden } from './feed-store';

/**
 * Хто отримає розсилку (59): адресати 56, з них — лише ті, хто має хоч одну підписку
 * і не вимкнув «Оголошення від адміністраторів» (немає профілю — увімкнено); ніколи не бот і не забанені.
 * Без повторів, у порядку id.
 */
export async function audienceOf(db: Db, to: BroadcastRecipients): Promise<string[]> {
  const ids = await recipientsFor(db, to);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(
      and(
        inArray(user.id, [...new Set(ids)]),
        sql`exists (select 1 from ${pushSubscription} where ${pushSubscription.userId} = ${user.id})`,
        sql`coalesce(${profile.adminPush}, true)`,
        notHidden(user.id),
      ),
    )
    .orderBy(asc(user.id));
  return rows.map((row) => row.id);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type BroadcastRow = typeof pushBroadcast.$inferSelect;

/** Ліміти розсилок (59), спільні для всіх адмінів: раз на 10 хв і 10 за ковзну добу. */
export async function broadcastLimits(db: Db | Tx, now: Date): Promise<AdminBroadcastLimits> {
  const rows = await db
    .select({ at: pushBroadcast.createdAt })
    .from(pushBroadcast)
    .where(gt(pushBroadcast.createdAt, new Date(now.getTime() - BROADCAST_DAY_MS)))
    .orderBy(asc(pushBroadcast.createdAt));
  const lastDay = rows.length;
  const times: number[] = [];
  const newest = rows[lastDay - 1];
  if (newest !== undefined) {
    const gap = newest.at.getTime() + BROADCAST_GAP_MS;
    if (gap > now.getTime()) times.push(gap);
  }
  if (lastDay >= BROADCAST_DAY_MAX) times.push(rows[lastDay - BROADCAST_DAY_MAX]!.at.getTime() + BROADCAST_DAY_MS);
  return { nextAt: times.length === 0 ? null : new Date(Math.max(...times)).toISOString(), lastDay, dayMax: BROADCAST_DAY_MAX };
}

function toOf(input: BroadcastRecipients): { recipients: 'all' | 'group' | 'people'; groupId: string | null; people: string[] } {
  if (input.kind === 'group') return { recipients: 'group', groupId: input.groupId, people: [] };
  if (input.kind === 'people') return { recipients: 'people', groupId: null, people: input.userIds };
  return { recipients: 'all', groupId: null, people: [] };
}

async function view(db: Db | Tx, rows: BroadcastRow[], now: Date): Promise<AdminBroadcast[]> {
  const adminIds = [...new Set(rows.map((r) => r.createdBy).filter((id): id is string => id !== null))];
  const personIds = [...new Set(rows.flatMap((r) => r.people))];
  const known = [...new Set([...adminIds, ...personIds])];
  const nicks = new Map<string, string>();
  if (known.length > 0) {
    const found = await db.select({ id: profile.userId, nickname: profile.nickname }).from(profile).where(inArray(profile.userId, known));
    for (const f of found) if (f.nickname !== null) nicks.set(f.id, f.nickname);
  }
  return rows.map((row) => {
    let to: AdminBroadcastTo;
    if (row.recipients === 'group') to = { kind: 'group', groupId: row.groupId ?? '', name: row.groupName };
    else if (row.recipients === 'people') to = { kind: 'people', people: row.people.filter((id) => nicks.has(id)).map((id) => ({ id, nickname: nicks.get(id)! })) };
    else to = { kind: 'all' };
    const stale = row.status === 'sending' && now.getTime() - row.createdAt.getTime() > BROADCAST_STALE_MS;
    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      admin: row.createdBy === null ? null : (nicks.get(row.createdBy) ?? null),
      title: row.title,
      text: row.text,
      url: row.url,
      to,
      people: row.peopleCount,
      delivered: row.delivered,
      failed: row.failed,
      status: stale ? 'interrupted' : row.status,
    };
  });
}

export type CreateBroadcastResult = { ok: true; row: AdminBroadcast } | { ok: false; error: 'broadcast_too_soon' | 'broadcast_day_limit'; nextAt: string };

/** Створює розсилку під замком: ліміти не розійдуться між паралельними адмінами; відмова не лишає ні рядка, ні журналу. */
export async function createBroadcast(db: Db, args: { adminId: string; input: BroadcastInput; people: string[]; now: Date }): Promise<CreateBroadcastResult> {
  const { adminId, input, people, now } = args;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('push_broadcast'))`);
    const limits = await broadcastLimits(tx, now);
    if (limits.nextAt !== null) {
      // Спершу 10 хв (broadcast_too_soon), далі доба.
      const [newest] = await tx.select({ at: pushBroadcast.createdAt }).from(pushBroadcast).orderBy(desc(pushBroadcast.createdAt)).limit(1);
      const tooSoon = newest !== undefined && newest.at.getTime() + BROADCAST_GAP_MS > now.getTime();
      return { ok: false, error: tooSoon ? 'broadcast_too_soon' : 'broadcast_day_limit', nextAt: limits.nextAt };
    }
    const target = toOf(input.recipients);
    let groupName: string | null = null;
    if (target.groupId !== null) {
      const [g] = await tx.select({ name: familyGroup.name }).from(familyGroup).where(eq(familyGroup.id, target.groupId));
      groupName = g?.name ?? null;
    }
    const [row] = await tx
      .insert(pushBroadcast)
      .values({
        createdBy: adminId,
        title: input.title,
        text: input.text,
        url: input.url,
        recipients: target.recipients,
        groupId: target.groupId,
        groupName,
        people: target.people,
        peopleCount: people.length,
        status: 'sending',
        createdAt: now,
      })
      .returning();
    await logAction(tx, { adminId, kind: 'push_broadcast', targetUserId: null, details: { title: input.title, count: people.length }, now });
    const [made] = await view(tx, [row!], now);
    return { ok: true as const, row: made! };
  });
}

export async function finishBroadcast(db: Db, id: string, counts: { delivered: number; failed: number }, now: Date): Promise<void> {
  await db.update(pushBroadcast).set({ status: 'sent', delivered: counts.delivered, failed: counts.failed, finishedAt: now }).where(eq(pushBroadcast.id, id));
}

export async function listBroadcasts(db: Db, now: Date): Promise<AdminBroadcast[]> {
  const rows = await db.select().from(pushBroadcast).orderBy(desc(pushBroadcast.createdAt), desc(pushBroadcast.id)).limit(BROADCAST_HISTORY);
  return view(db, rows, now);
}
