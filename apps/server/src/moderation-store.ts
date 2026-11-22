import {
  ADMIN_PAGE_SIZE,
  ADMIN_QUERY_MAX,
  BOT_USER_ID,
  GROUP_LIMITS,
  adminPages,
  pageOffset,
  type AdminFeedKind,
  type AdminFeedRow,
  type AdminGroupDetail,
  type AdminGroupItem,
  type AdminGroupMember,
  type AdminGroupRow,
  type AdminList,
  type GroupItemInput,
} from '@quiz/shared';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { logAction } from './bans';
import type { Db } from './db/client';
import { familyGroup, feedEvent, groupInvite, groupItem, groupMember, profile, user, userBan, userLike } from './db/schema';
import { eventLikes } from './feed-store';
import type { Fail } from './calendar-store';
import { createBotItem } from './group-items';
import { deleteGroup, groupsOf, lockPerson, peopleIn, roleIn, swapOwner } from './group-store';
import { addGroupAdded } from './inbox-store';
import { containsPattern } from './like-escape';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

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

// ——— Групи (63) ———

/** Пошук адміна в групах: будь-який непорожній рядок (і один символ); %, _ і \ екрануються, як у searchProfiles. */
function groupPattern(q: string | undefined): string | null {
  const text = (q ?? '').trim().slice(0, ADMIN_QUERY_MAX);
  if (text.length === 0) return null;
  return containsPattern(text);
}

/** Власник групи (частковий унікальний індекс: не більше одного). */
const groupOwner = and(eq(groupMember.groupId, familyGroup.id), eq(groupMember.role, 'owner'));
const membersOf = sql<number>`(select count(*)::int from ${groupMember} m where m.group_id = ${familyGroup.id})`;
const itemsOf = sql<number>`(select count(*)::int from ${groupItem} i where i.group_id = ${familyGroup.id})`;

const groupRowFields = {
  group: familyGroup,
  ownerId: groupMember.userId,
  ownerNickname: profile.nickname,
  members: membersOf,
  items: itemsOf,
};

function toGroupRow(r: { group: typeof familyGroup.$inferSelect; ownerId: string | null; ownerNickname: string | null; members: number; items: number }): AdminGroupRow {
  return {
    id: r.group.id,
    name: r.group.name,
    emoji: r.group.emoji,
    owner: r.ownerId === null ? null : { id: r.ownerId, nickname: r.ownerNickname },
    members: Number(r.members),
    items: Number(r.items),
    createdAt: r.group.createdAt.toISOString(),
    hidden: r.group.hiddenAt === null ? null : { at: r.group.hiddenAt.toISOString(), reason: r.group.hiddenReason },
  };
}

/** 63: усі групи (і приховані) — пошук за назвою чи ніком власника, новіші першими. */
export async function adminGroups(db: Db, query: { q?: string; page: number }): Promise<AdminList<AdminGroupRow>> {
  const like = groupPattern(query.q);
  const where = like === null ? undefined : sql`(${familyGroup.name} ilike ${like} or ${profile.nickname} ilike ${like})`;
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(familyGroup)
    .leftJoin(groupMember, groupOwner)
    .leftJoin(profile, eq(profile.userId, groupMember.userId))
    .where(where);
  const total = Number(n ?? 0);
  const rows = await db
    .select(groupRowFields)
    .from(familyGroup)
    .leftJoin(groupMember, groupOwner)
    .leftJoin(profile, eq(profile.userId, groupMember.userId))
    .where(where)
    .orderBy(desc(familyGroup.createdAt), desc(familyGroup.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset(pageOffset(query.page, ADMIN_PAGE_SIZE));
  return { rows: rows.map(toGroupRow), total, page: query.page, pages: adminPages(total) };
}

/** 63: картка групи для адміна — стан як є (без repair): усі члени з заблокованими, усі записи (сюрпризи й приховані) по 50. */
export async function adminGroup(db: Db, groupId: string, page: number): Promise<AdminGroupDetail | null> {
  if (!UUID.test(groupId)) return null;
  const [found] = await db
    .select(groupRowFields)
    .from(familyGroup)
    .leftJoin(groupMember, groupOwner)
    .leftJoin(profile, eq(profile.userId, groupMember.userId))
    .where(eq(familyGroup.id, groupId));
  if (found === undefined) return null;
  const people = await db
    .select({
      id: groupMember.userId,
      nickname: profile.nickname,
      role: groupMember.role,
      joinedAt: groupMember.joinedAt,
      banned: sql<boolean>`exists (select 1 from ${userBan} where ${userBan.userId} = ${groupMember.userId})`,
    })
    .from(groupMember)
    .leftJoin(profile, eq(profile.userId, groupMember.userId))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(sql`${groupMember.role} = 'owner' DESC`, asc(groupMember.joinedAt), asc(groupMember.userId));
  const members: AdminGroupMember[] = people.map((p) => ({ ...p, joinedAt: p.joinedAt.toISOString(), banned: p.banned === true }));
  const total = Number(found.items);
  const records = await db
    .select({ item: groupItem, author: profile.nickname })
    .from(groupItem)
    .leftJoin(profile, eq(profile.userId, groupItem.authorId))
    .where(eq(groupItem.groupId, groupId))
    .orderBy(desc(groupItem.createdAt), desc(groupItem.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset(pageOffset(page, ADMIN_PAGE_SIZE));
  const rows: AdminGroupItem[] = records.map(({ item, author }) => ({
    id: item.id,
    kind: item.kind,
    text: item.text,
    author: item.authorId === null ? null : author,
    surprise: item.surprise,
    createdAt: item.createdAt.toISOString(),
    hidden: item.hiddenAt !== null,
  }));
  return { group: toGroupRow(found), members, items: { rows, total, page, pages: adminPages(total) } };
}

type GroupRow = typeof familyGroup.$inferSelect;

/** Рядок групи під FOR UPDATE (той самий замок, що й у group-store); немає — undefined. */
async function lockedGroup(tx: Tx, groupId: string): Promise<GroupRow | undefined> {
  const [row] = await tx.select().from(familyGroup).where(eq(familyGroup.id, groupId)).for('update');
  return row;
}

async function ownerOf(tx: Tx, groupId: string): Promise<string | null> {
  const [row] = await tx
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.role, 'owner')));
  return row?.userId ?? null;
}

type Changed = { ok: true; changed: boolean };

/** 63: «Сховати»/«Повернути» групу; повторне ховання з іншою причиною лише оновлює причину. Ціль у журналі — власник. */
export async function setGroupHidden(
  db: Db,
  input: { adminId: string; groupId: string; hidden: boolean; reason: string | null; now: Date },
): Promise<Changed | Fail<'group_not_found'>> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  return db.transaction(async (tx) => {
    const group = await lockedGroup(tx, input.groupId);
    if (group === undefined) return { ok: false as const, error: 'group_not_found' as const };
    const isHidden = group.hiddenAt !== null;
    if (input.hidden ? isHidden && group.hiddenReason === input.reason : !isHidden) return { ok: true as const, changed: false };
    await tx
      .update(familyGroup)
      .set(input.hidden ? { hiddenAt: group.hiddenAt ?? input.now, hiddenReason: input.reason } : { hiddenAt: null, hiddenReason: null })
      .where(eq(familyGroup.id, group.id));
    await logAction(tx, {
      adminId: input.adminId,
      kind: input.hidden ? 'group_hide' : 'group_restore',
      targetUserId: await ownerOf(tx, group.id),
      details: input.hidden ? { title: group.name, reason: input.reason } : { title: group.name },
      now: input.now,
    });
    return { ok: true as const, changed: true };
  });
}

/** 63: вилучити члена (не власника); його запрошення в цю групу теж зникає. */
export async function adminRemoveMember(
  db: Db,
  input: { adminId: string; groupId: string; userId: string; now: Date },
): Promise<Changed | Fail<'group_not_found' | 'member_not_found' | 'owner_must_transfer'>> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  return db.transaction(async (tx) => {
    const group = await lockedGroup(tx, input.groupId);
    if (group === undefined) return { ok: false as const, error: 'group_not_found' as const };
    const role = await roleIn(tx, group.id, input.userId);
    if (role === null) return { ok: false as const, error: 'member_not_found' as const };
    if (role === 'owner') return { ok: false as const, error: 'owner_must_transfer' as const };
    await tx.delete(groupMember).where(and(eq(groupMember.groupId, group.id), eq(groupMember.userId, input.userId)));
    await tx.delete(groupInvite).where(and(eq(groupInvite.groupId, group.id), eq(groupInvite.userId, input.userId)));
    await logAction(tx, { adminId: input.adminId, kind: 'group_member_remove', targetUserId: input.userId, details: { title: group.name }, now: input.now });
    return { ok: true as const, changed: true };
  });
}

/**
 * 63: передати групу члену — лише незаблокованому учаснику (role member), не боту: інакше repair одразу б «полагодив» назад.
 * Обмін ролей — swapOwner (один власник навіть на мить); групі без власника новий просто призначається.
 */
export async function adminTransferOwner(
  db: Db,
  input: { adminId: string; groupId: string; toId: string; now: Date },
): Promise<Changed | Fail<'group_not_found' | 'member_not_found'>> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  return db.transaction(async (tx) => {
    const group = await lockedGroup(tx, input.groupId);
    if (group === undefined) return { ok: false as const, error: 'group_not_found' as const };
    if (input.toId === BOT_USER_ID || (await roleIn(tx, group.id, input.toId)) !== 'member') {
      return { ok: false as const, error: 'member_not_found' as const };
    }
    const [banned] = await tx.select({ id: userBan.userId }).from(userBan).where(eq(userBan.userId, input.toId));
    if (banned !== undefined) return { ok: false as const, error: 'member_not_found' as const };
    const fromId = await ownerOf(tx, group.id);
    let former = '';
    if (fromId === null) {
      await tx
        .update(groupMember)
        .set({ role: 'owner' })
        .where(and(eq(groupMember.groupId, group.id), eq(groupMember.userId, input.toId)));
    } else {
      const [was] = await tx.select({ nickname: profile.nickname }).from(profile).where(eq(profile.userId, fromId));
      former = was?.nickname ?? '';
      await swapOwner(tx, group.id, fromId, input.toId);
    }
    await logAction(tx, {
      adminId: input.adminId,
      kind: 'group_owner_transfer',
      targetUserId: input.toId,
      details: { title: group.name, text: former },
      now: input.now,
    });
    return { ok: true as const, changed: true };
  });
}

/** 63: видалити групу — лише за збігу назви (trim() обох, з урахуванням регістру); рядок журналу без FK на групу лишається. */
export async function adminDeleteGroup(
  db: Db,
  input: { adminId: string; groupId: string; name: string; now: Date },
): Promise<Changed | Fail<'group_not_found' | 'group_name_mismatch'>> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  return db.transaction(async (tx) => {
    const group = await lockedGroup(tx, input.groupId);
    if (group === undefined) return { ok: false as const, error: 'group_not_found' as const };
    if (input.name.trim() !== group.name.trim()) return { ok: false as const, error: 'group_name_mismatch' as const };
    await logAction(tx, { adminId: input.adminId, kind: 'group_delete', targetUserId: await ownerOf(tx, group.id), details: { title: group.name }, now: input.now });
    await deleteGroup(tx, group.id);
    return { ok: true as const, changed: true };
  });
}

/**
 * 72: адмін додає людину до групи напряму (без запрошення й без дружби з власником). Замки — людина, потім група, як у group-store;
 * межі ті самі (30 людей, 10 видимих груп); прихована група — спершу повернути. Її запрошення в цю групу зникає.
 * Сповіщення — рядок у «Вхідних» людини в тій самій транзакції (пуш — окремо, у маршруті); власнику — нічого.
 */
export async function adminAddMember(
  db: Db,
  input: { adminId: string; groupId: string; userId: string; now: Date },
): Promise<
  | { ok: true; changed: true; groupName: string }
  | Fail<'group_not_found' | 'user_not_found' | 'member_banned' | 'group_hidden' | 'already_member' | 'group_full' | 'member_too_many_groups'>
> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  return db.transaction(async (tx) => {
    await lockPerson(tx, input.userId);
    const group = await lockedGroup(tx, input.groupId);
    if (group === undefined) return { ok: false as const, error: 'group_not_found' as const };
    const [person] = input.userId === BOT_USER_ID ? [] : await tx.select({ id: user.id }).from(user).where(eq(user.id, input.userId));
    if (person === undefined) return { ok: false as const, error: 'user_not_found' as const };
    const [banned] = await tx.select({ id: userBan.userId }).from(userBan).where(eq(userBan.userId, input.userId));
    if (banned !== undefined) return { ok: false as const, error: 'member_banned' as const };
    if (group.hiddenAt !== null) return { ok: false as const, error: 'group_hidden' as const };
    if ((await roleIn(tx, group.id, input.userId)) !== null) return { ok: false as const, error: 'already_member' as const };
    if ((await peopleIn(tx, group.id)) >= GROUP_LIMITS.membersMax) return { ok: false as const, error: 'group_full' as const };
    if ((await groupsOf(tx, input.userId)) >= GROUP_LIMITS.groupsPerUser) return { ok: false as const, error: 'member_too_many_groups' as const };
    await tx.insert(groupMember).values({ groupId: group.id, userId: input.userId, role: 'member', joinedAt: input.now });
    await tx.delete(groupInvite).where(and(eq(groupInvite.groupId, group.id), eq(groupInvite.userId, input.userId)));
    await addGroupAdded(tx, { userId: input.userId, groupId: group.id, now: input.now });
    await logAction(tx, { adminId: input.adminId, kind: 'group_member_add', targetUserId: input.userId, details: { title: group.name }, now: input.now });
    return { ok: true as const, changed: true as const, groupName: group.name };
  });
}

/** 72: запис у групу від Квіз-бота; ціль у журналі — власник групи, у деталях — назва групи й перші 200 символів. */
export async function adminAddItem(
  db: Db,
  input: { adminId: string; groupId: string; item: GroupItemInput; now: Date },
): Promise<{ ok: true; itemId: string } | Fail<'group_not_found' | 'group_hidden' | 'group_items_full' | 'about_not_member' | 'bot_unavailable'>> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  // Бота немає, якщо його пошту зайняв інший рядок (ensureBotAccount): тоді й автора для запису немає.
  const [bot] = await db.select({ id: user.id }).from(user).where(eq(user.id, BOT_USER_ID));
  if (bot === undefined) return { ok: false, error: 'bot_unavailable' };
  const made = await createBotItem(db, {
    groupId: input.groupId,
    input: input.item,
    now: input.now,
    log: async (tx, row, groupName) =>
      logAction(tx, {
        adminId: input.adminId,
        kind: 'group_item_add',
        targetUserId: await ownerOf(tx, input.groupId),
        details: { title: groupName, text: row.text.slice(0, 200) },
        now: input.now,
      }),
  });
  return made.ok ? { ok: true, itemId: made.row.id } : made;
}

/** 63: «Сховати»/«Показати» запис групи; ціль — автор (чи null), у журналі — назва групи й перші 200 символів. */
export async function setItemHidden(
  db: Db,
  input: { adminId: string; groupId: string; itemId: string; hidden: boolean; now: Date },
): Promise<Changed | Fail<'group_not_found' | 'item_not_found'>> {
  if (!UUID.test(input.groupId)) return { ok: false, error: 'group_not_found' };
  if (!UUID.test(input.itemId)) return { ok: false, error: 'item_not_found' };
  return db.transaction(async (tx) => {
    const [group] = await tx.select({ name: familyGroup.name }).from(familyGroup).where(eq(familyGroup.id, input.groupId));
    if (group === undefined) return { ok: false as const, error: 'group_not_found' as const };
    const [item] = await tx
      .select()
      .from(groupItem)
      .where(and(eq(groupItem.id, input.itemId), eq(groupItem.groupId, input.groupId)))
      .for('update');
    if (item === undefined) return { ok: false as const, error: 'item_not_found' as const };
    if ((item.hiddenAt !== null) === input.hidden) return { ok: true as const, changed: false };
    await tx
      .update(groupItem)
      .set({ hiddenAt: input.hidden ? input.now : null })
      .where(eq(groupItem.id, item.id));
    await logAction(tx, {
      adminId: input.adminId,
      kind: input.hidden ? 'group_item_hide' : 'group_item_show',
      targetUserId: item.authorId,
      details: { title: group.name, text: item.text.slice(0, 200) },
      now: input.now,
    });
    return { ok: true as const, changed: true };
  });
}
