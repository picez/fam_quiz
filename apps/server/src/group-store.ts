import { randomBytes } from 'node:crypto';
import {
  GROUP_CODE,
  GROUP_CODE_ALPHABET,
  GROUP_LIMITS,
  type GroupCard,
  type GroupDetail,
  type GroupInput,
  type GroupInviteCard,
  type GroupJoinPreview,
  type GroupMember,
  type GroupRole,
  type GroupsPage,
  type ProfileCard,
} from '@quiz/shared';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { familyGroup, follow, groupInvite, groupMember, profile } from './db/schema';
import { countVisibleItems } from './group-items';
import { ensureProfile } from './profiles';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Fail<E extends string> = { ok: false; error: E };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';
const CODE_ATTEMPTS = 3;

/** Код посилання: 10 символів з GROUP_CODE_ALPHABET; байти поза рівним діапазоном відкидаються (без перекосу). */
export function newInviteCode(random: (n: number) => Uint8Array = (size) => randomBytes(size)): string {
  const size = GROUP_CODE_ALPHABET.length;
  const fair = Math.floor(256 / size) * size;
  let code = '';
  while (code.length < 10) {
    for (const byte of random(16)) {
      if (byte >= fair) continue;
      code += GROUP_CODE_ALPHABET[byte % size];
      if (code.length === 10) break;
    }
  }
  return code;
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

/** Картки людей у тому самому порядку; профіль, якого ще немає, створюється. Зниклого акаунта немає в результаті. */
export async function profileCards(db: Db, ids: readonly string[]): Promise<Map<string, ProfileCard>> {
  const found = new Map<string, ProfileCard>();
  if (ids.length === 0) return found;
  const rows = await db
    .select({ id: profile.userId, nickname: profile.nickname, avatar: profile.avatar })
    .from(profile)
    .where(inArray(profile.userId, [...new Set(ids)]));
  for (const row of rows) found.set(row.id, row);
  for (const id of ids) {
    if (found.has(id)) continue;
    const created = await ensureProfile(db, id);
    if (created !== null) found.set(id, created);
  }
  return found;
}

/**
 * Лагодить групу, що втратила власника (акаунт видалено): власником стає той, хто приєднався найраніше;
 * група без жодного учасника видаляється. false — групи (вже) немає.
 */
async function repair(db: Db, groupId: string): Promise<boolean> {
  const [state] = await db
    .select({
      members: sql<number>`(SELECT count(*)::int FROM ${groupMember} WHERE ${groupMember.groupId} = ${familyGroup.id})`,
      owners: sql<number>`(SELECT count(*)::int FROM ${groupMember} WHERE ${groupMember.groupId} = ${familyGroup.id} AND ${groupMember.role} = 'owner')`,
    })
    .from(familyGroup)
    .where(eq(familyGroup.id, groupId));
  if (state === undefined) return false;
  if (Number(state.owners) > 0) return true;
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: familyGroup.id }).from(familyGroup).where(eq(familyGroup.id, groupId)).for('update');
    if (locked === undefined) return false;
    const members = await tx
      .select({ userId: groupMember.userId, role: groupMember.role })
      .from(groupMember)
      .where(eq(groupMember.groupId, groupId))
      .orderBy(asc(groupMember.joinedAt), asc(groupMember.userId));
    if (members.length === 0) {
      await tx.delete(familyGroup).where(eq(familyGroup.id, groupId));
      return false;
    }
    if (!members.some((m) => m.role === 'owner')) {
      await tx
        .update(groupMember)
        .set({ role: 'owner' })
        .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, members[0].userId)));
    }
    return true;
  });
}

/** Роль людини в групі; не учасник чи групи немає — null. Лагодить групу без власника (див. «Рішення»). */
export async function membership(db: Db, groupId: string, userId: string): Promise<GroupRole | null> {
  if (!UUID.test(groupId)) return null;
  if (!(await repair(db, groupId))) return null;
  const [row] = await db
    .select({ role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
  return row?.role ?? null;
}

async function peopleIn(db: Db | Tx, groupId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(groupMember).where(eq(groupMember.groupId, groupId));
  return Number(row?.n ?? 0);
}

async function groupsOf(db: Db | Tx, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(groupMember).where(eq(groupMember.userId, userId));
  return Number(row?.n ?? 0);
}

/** Мої групи — від найновішого вступу — і запрошення до мене. */
export async function listGroups(db: Db, userId: string): Promise<GroupsPage> {
  const mine = await db
    .select({ groupId: groupMember.groupId })
    .from(groupMember)
    .where(eq(groupMember.userId, userId));
  for (const { groupId } of mine) await repair(db, groupId);

  const rows = await db
    .select({
      id: familyGroup.id,
      name: familyGroup.name,
      emoji: familyGroup.emoji,
      description: familyGroup.description,
      role: groupMember.role,
      joinedAt: groupMember.joinedAt,
      people: sql<number>`(SELECT count(*)::int FROM ${groupMember} m WHERE m.group_id = ${familyGroup.id})`,
    })
    .from(groupMember)
    .innerJoin(familyGroup, eq(familyGroup.id, groupMember.groupId))
    .where(eq(groupMember.userId, userId))
    .orderBy(desc(groupMember.joinedAt), asc(familyGroup.id));
  const items = await countVisibleItems(db, rows.map((r) => r.id), userId);
  const groups: GroupCard[] = rows.map((row) => ({
    ...row,
    people: Number(row.people),
    items: items.get(row.id) ?? 0,
    joinedAt: row.joinedAt.toISOString(),
  }));
  return { groups, invites: await invitesFor(db, userId) };
}

export async function groupDetail(db: Db, groupId: string, viewerId: string): Promise<GroupDetail | null> {
  const role = await membership(db, groupId, viewerId);
  if (role === null) return null;
  const [group] = await db.select().from(familyGroup).where(eq(familyGroup.id, groupId));
  if (group === undefined) return null;
  const rows = await db
    .select({ userId: groupMember.userId, role: groupMember.role, joinedAt: groupMember.joinedAt })
    .from(groupMember)
    .where(eq(groupMember.groupId, groupId))
    .orderBy(sql`${groupMember.role} = 'owner' DESC`, asc(groupMember.joinedAt), asc(groupMember.userId));
  const cards = await profileCards(db, rows.map((r) => r.userId));
  const members: GroupMember[] = [];
  for (const row of rows) {
    const card = cards.get(row.userId);
    if (card === undefined) continue;
    members.push({ ...card, role: row.role, joinedAt: row.joinedAt.toISOString(), you: row.userId === viewerId });
  }
  const own = rows.find((r) => r.userId === viewerId);
  const items = await countVisibleItems(db, [groupId], viewerId);
  const detail: GroupDetail = {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    description: group.description,
    role,
    people: rows.length,
    items: items.get(groupId) ?? 0,
    joinedAt: (own?.joinedAt ?? group.createdAt).toISOString(),
    members,
  };
  if (role === 'owner') {
    detail.inviteCode = group.inviteCode;
    const pending = await db
      .select({ userId: groupInvite.userId, at: groupInvite.createdAt })
      .from(groupInvite)
      .where(eq(groupInvite.groupId, groupId))
      .orderBy(desc(groupInvite.createdAt), asc(groupInvite.userId));
    const invited = await profileCards(db, pending.map((p) => p.userId));
    detail.pending = pending.flatMap((p) => {
      const user = invited.get(p.userId);
      return user === undefined ? [] : [{ user, at: p.at.toISOString() }];
    });
  }
  return detail;
}

export async function createGroup(
  db: Db,
  ownerId: string,
  input: GroupInput,
  now: Date,
): Promise<{ ok: true; id: string } | Fail<'too_many_groups'>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        if ((await groupsOf(tx, ownerId)) >= GROUP_LIMITS.groupsPerUser) return { ok: false, error: 'too_many_groups' } as const;
        const [created] = await tx
          .insert(familyGroup)
          .values({ ...input, inviteCode: newInviteCode(), createdAt: now, updatedAt: now })
          .returning({ id: familyGroup.id });
        await tx.insert(groupMember).values({ groupId: created.id, userId: ownerId, role: 'owner', joinedAt: now });
        return { ok: true, id: created.id } as const;
      });
    } catch (error) {
      if (attempt >= CODE_ATTEMPTS || !isUniqueViolation(error)) throw error;
    }
  }
}

export async function updateGroup(db: Db, groupId: string, input: GroupInput, now: Date): Promise<void> {
  await db
    .update(familyGroup)
    .set({ name: input.name, emoji: input.emoji, description: input.description, updatedAt: now })
    .where(eq(familyGroup.id, groupId));
}

export async function deleteGroup(db: Db, groupId: string): Promise<void> {
  await db.delete(familyGroup).where(eq(familyGroup.id, groupId));
}

export async function refreshCode(db: Db, groupId: string, now: Date): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const code = newInviteCode();
    try {
      await db.update(familyGroup).set({ inviteCode: code, updatedAt: now }).where(eq(familyGroup.id, groupId));
      return code;
    } catch (error) {
      if (attempt >= CODE_ATTEMPTS || !isUniqueViolation(error)) throw error;
    }
  }
}

async function lockGroup(tx: Tx, groupId: string): Promise<boolean> {
  const [row] = await tx.select({ id: familyGroup.id }).from(familyGroup).where(eq(familyGroup.id, groupId)).for('update');
  return row !== undefined;
}

async function roleIn(db: Db | Tx, groupId: string, userId: string): Promise<GroupRole | null> {
  const [row] = await db
    .select({ role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
  return row?.role ?? null;
}

export async function transferOwner(
  db: Db,
  groupId: string,
  fromId: string,
  toId: string,
): Promise<{ ok: true } | Fail<'member_not_found'>> {
  return db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    if (fromId === toId || (await roleIn(tx, groupId, toId)) !== 'member') return { ok: false, error: 'member_not_found' } as const;
    // Спершу старий власник — учасник: частковий унікальний індекс не допускає двох власників навіть на мить.
    await tx.update(groupMember).set({ role: 'member' }).where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, fromId)));
    await tx.update(groupMember).set({ role: 'owner' }).where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, toId)));
    return { ok: true } as const;
  });
}

export async function removeMember(
  db: Db,
  groupId: string,
  ownerId: string,
  userId: string,
): Promise<{ ok: true } | Fail<'member_not_found' | 'owner_must_transfer'>> {
  if (userId === ownerId) return { ok: false, error: 'owner_must_transfer' };
  const removed = await db
    .delete(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId), eq(groupMember.role, 'member')))
    .returning({ userId: groupMember.userId });
  return removed.length === 0 ? { ok: false, error: 'member_not_found' } : { ok: true };
}

export async function leaveGroup(db: Db, groupId: string, userId: string): Promise<{ ok: true } | Fail<'owner_must_transfer'>> {
  if ((await roleIn(db, groupId, userId)) === 'owner') return { ok: false, error: 'owner_must_transfer' };
  await db
    .delete(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId), eq(groupMember.role, 'member')));
  return { ok: true };
}

/** Лише друзі власника (follow), не учасники, без власного id; повертає справді запрошених. */
export async function inviteFriends(
  db: Db,
  groupId: string,
  ownerId: string,
  userIds: string[],
  now: Date,
): Promise<{ ok: true; invited: ProfileCard[] } | Fail<'invites_full'>> {
  const wanted = [...new Set(userIds)].filter((id) => id !== ownerId);
  if (wanted.length === 0) return { ok: true, invited: [] };
  const outcome = await db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    const friends = new Set(
      (
        await tx
          .select({ id: follow.followeeId })
          .from(follow)
          .where(and(eq(follow.followerId, ownerId), inArray(follow.followeeId, wanted)))
      ).map((r) => r.id),
    );
    const members = new Set(
      (
        await tx
          .select({ id: groupMember.userId })
          .from(groupMember)
          .where(and(eq(groupMember.groupId, groupId), inArray(groupMember.userId, wanted)))
      ).map((r) => r.id),
    );
    const pending = await tx.select({ id: groupInvite.userId }).from(groupInvite).where(eq(groupInvite.groupId, groupId));
    const waiting = new Set(pending.map((r) => r.id));
    const fresh = wanted.filter((id) => friends.has(id) && !members.has(id) && !waiting.has(id));
    if (pending.length + fresh.length > GROUP_LIMITS.invitesMax) return { ok: false, error: 'invites_full' } as const;
    if (fresh.length > 0) {
      await tx
        .insert(groupInvite)
        .values(fresh.map((userId) => ({ groupId, userId, invitedBy: ownerId, createdAt: now })))
        .onConflictDoNothing();
    }
    return { ok: true, fresh } as const;
  });
  if (!outcome.ok) return outcome;
  const cards = await profileCards(db, outcome.fresh);
  return { ok: true, invited: outcome.fresh.flatMap((id) => cards.get(id) ?? []) };
}

export async function cancelInvite(db: Db, groupId: string, userId: string): Promise<void> {
  await db.delete(groupInvite).where(and(eq(groupInvite.groupId, groupId), eq(groupInvite.userId, userId)));
}

/** Запрошення до людини — найновіші першими. */
export async function invitesFor(db: Db, userId: string): Promise<GroupInviteCard[]> {
  const rows = await db
    .select({
      id: familyGroup.id,
      name: familyGroup.name,
      emoji: familyGroup.emoji,
      from: groupInvite.invitedBy,
      at: groupInvite.createdAt,
      people: sql<number>`(SELECT count(*)::int FROM ${groupMember} m WHERE m.group_id = ${familyGroup.id})`,
    })
    .from(groupInvite)
    .innerJoin(familyGroup, eq(familyGroup.id, groupInvite.groupId))
    .where(eq(groupInvite.userId, userId))
    .orderBy(desc(groupInvite.createdAt), asc(familyGroup.id));
  const cards = await profileCards(db, rows.flatMap((r) => (r.from === null ? [] : [r.from])));
  return rows.map((row) => ({
    group: { id: row.id, name: row.name, emoji: row.emoji, people: Number(row.people) },
    from: row.from === null ? null : (cards.get(row.from) ?? null),
    at: row.at.toISOString(),
  }));
}

/** Вступ будь-яким шляхом: група під FOR UPDATE, межі 30 людей і 10 груп, запрошення цієї людини зникає. */
async function addMember(
  tx: Tx,
  groupId: string,
  userId: string,
  now: Date,
): Promise<{ ok: true } | Fail<'group_not_found' | 'group_full' | 'too_many_groups'>> {
  if (!(await lockGroup(tx, groupId))) return { ok: false, error: 'group_not_found' };
  if ((await roleIn(tx, groupId, userId)) !== null) return { ok: true };
  if ((await peopleIn(tx, groupId)) >= GROUP_LIMITS.membersMax) return { ok: false, error: 'group_full' };
  if ((await groupsOf(tx, userId)) >= GROUP_LIMITS.groupsPerUser) return { ok: false, error: 'too_many_groups' };
  await tx.insert(groupMember).values({ groupId, userId, role: 'member', joinedAt: now });
  await tx.delete(groupInvite).where(and(eq(groupInvite.groupId, groupId), eq(groupInvite.userId, userId)));
  return { ok: true };
}

export async function acceptInvite(
  db: Db,
  groupId: string,
  userId: string,
  now: Date,
): Promise<{ ok: true } | Fail<'invite_not_found' | 'group_full' | 'too_many_groups'>> {
  if (!UUID.test(groupId)) return { ok: false, error: 'invite_not_found' };
  if (!(await repair(db, groupId))) return { ok: false, error: 'invite_not_found' };
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select({ userId: groupInvite.userId })
      .from(groupInvite)
      .where(and(eq(groupInvite.groupId, groupId), eq(groupInvite.userId, userId)));
    if (invite === undefined) return { ok: false, error: 'invite_not_found' } as const;
    const added = await addMember(tx, groupId, userId, now);
    if (added.ok) return added;
    return { ok: false, error: added.error === 'group_not_found' ? 'invite_not_found' : added.error } as const;
  });
}

export async function declineInvite(db: Db, groupId: string, userId: string): Promise<void> {
  if (!UUID.test(groupId)) return;
  await cancelInvite(db, groupId, userId);
}

async function groupByCode(db: Db, code: string): Promise<typeof familyGroup.$inferSelect | null> {
  if (!GROUP_CODE.test(code)) return null;
  const [group] = await db.select().from(familyGroup).where(eq(familyGroup.inviteCode, code));
  if (group === undefined || !(await repair(db, group.id))) return null;
  return group;
}

export async function joinPreview(db: Db, code: string, viewerId: string): Promise<GroupJoinPreview | null> {
  const group = await groupByCode(db, code);
  if (group === null) return null;
  const [owner] = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, group.id), eq(groupMember.role, 'owner')));
  const ownerCard = owner === undefined ? null : ((await profileCards(db, [owner.userId])).get(owner.userId) ?? null);
  return {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    description: group.description,
    people: await peopleIn(db, group.id),
    owner: ownerCard,
    member: (await roleIn(db, group.id, viewerId)) !== null,
  };
}

export async function joinByCode(
  db: Db,
  code: string,
  userId: string,
  now: Date,
): Promise<{ ok: true; id: string } | Fail<'group_not_found' | 'group_full' | 'too_many_groups'>> {
  const group = await groupByCode(db, code);
  if (group === null) return { ok: false, error: 'group_not_found' };
  const added = await db.transaction((tx) => addMember(tx, group.id, userId, now));
  return added.ok ? { ok: true, id: group.id } : added;
}
