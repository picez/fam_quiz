import {
  GROUP_LIMITS,
  type GroupAboutStored,
  type GroupAboutView,
  type GroupItem,
  type GroupItemInput,
  type GroupRole,
  type ProfileCard,
} from '@quiz/shared';
import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { familyGroup, groupItem, groupMember, profile } from './db/schema';
import { notHidden } from './feed-store';
import { ensureProfile } from './profiles';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Fail<E extends string> = { ok: false; error: E };
type ItemRow = typeof groupItem.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Умова SQL «viewer бачить запис» (сюрприз про нього — ні, крім власних). Одна на весь код; її візьме 12l. */
export function visibleItemsWhere(viewerId: string): SQL {
  return sql`NOT (${groupItem.surprise}
    AND ${groupItem.about} @> jsonb_build_array(jsonb_build_object('userId', ${viewerId}::text))
    AND ${groupItem.authorId} IS DISTINCT FROM ${viewerId}::text)`;
}

/** Скільки записів кожної з груп бачить глядач. */
export async function countVisibleItems(db: Db, groupIds: readonly string[], viewerId: string): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  if (groupIds.length === 0) return found;
  const rows = await db
    .select({ groupId: groupItem.groupId, n: count() })
    .from(groupItem)
    .where(and(inArray(groupItem.groupId, [...groupIds]), visibleItemsWhere(viewerId)))
    .groupBy(groupItem.groupId);
  for (const row of rows) found.set(row.groupId, Number(row.n));
  return found;
}

/** Теперішні учасники групи з картками (профіль, якого ще немає, створюється). */
async function memberCards(db: Db, groupId: string): Promise<Map<string, ProfileCard>> {
  const rows = await db
    .select({ id: groupMember.userId, nickname: profile.nickname, avatar: profile.avatar, hasProfile: profile.userId })
    .from(groupMember)
    .leftJoin(profile, eq(profile.userId, groupMember.userId))
    // Заблокованих (бан #23) не показуємо: автор такого запису — «вже не в групі», записи лишаються.
    .where(and(eq(groupMember.groupId, groupId), notHidden(groupMember.userId)));
  const cards = new Map<string, ProfileCard>();
  for (const row of rows) {
    if (row.hasProfile !== null) {
      cards.set(row.id, { id: row.id, nickname: row.nickname, avatar: row.avatar });
      continue;
    }
    const created = await ensureProfile(db, row.id);
    if (created !== null) cards.set(row.id, created);
  }
  return cards;
}

function toView(row: ItemRow, members: Map<string, ProfileCard>, viewerId: string, role: GroupRole): GroupItem {
  const about: GroupAboutView[] = row.about.map((entry) => {
    if (entry.kind === 'name') return { kind: 'name', name: entry.name };
    const now = members.get(entry.userId);
    return now === undefined
      ? { kind: 'member', userId: entry.userId, name: entry.name, former: true }
      : { kind: 'member', userId: entry.userId, name: now.nickname ?? '', former: false };
  });
  const mine = row.authorId === viewerId;
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    about,
    answer: row.answer,
    year: row.year,
    photo: row.photo,
    surprise: row.surprise,
    author: row.authorId === null ? null : (members.get(row.authorId) ?? null),
    mine,
    canDelete: mine || role === 'owner',
    uses: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Видимі глядачеві записи групи, найновіші першими. */
export async function listItems(db: Db, groupId: string, viewerId: string, viewerRole: GroupRole): Promise<GroupItem[]> {
  const rows = await db
    .select()
    .from(groupItem)
    .where(and(eq(groupItem.groupId, groupId), visibleItemsWhere(viewerId)))
    .orderBy(desc(groupItem.createdAt), desc(groupItem.id));
  const members = await memberCards(db, groupId);
  return rows.map((row) => toView(row, members, viewerId, viewerRole));
}

/**
 * «Про кого» для збереження: учасник мусить бути в групі (або вже був у цьому записі — тоді лишається
 * зі збереженим іменем); ім'я учасника — нік на цю мить.
 */
function storedAbout(
  input: GroupItemInput['about'],
  members: Map<string, ProfileCard>,
  previous: readonly GroupAboutStored[],
): GroupAboutStored[] | null {
  const stored: GroupAboutStored[] = [];
  for (const entry of input) {
    if (entry.kind === 'name') {
      stored.push({ kind: 'name', name: entry.name });
      continue;
    }
    const now = members.get(entry.userId);
    if (now !== undefined) {
      stored.push({ kind: 'member', userId: entry.userId, name: now.nickname ?? '' });
      continue;
    }
    const before = previous.find((p) => p.kind === 'member' && p.userId === entry.userId);
    if (before === undefined) return null;
    stored.push(before);
  }
  return stored;
}

/** Замок групи й перевірка під ним: група ще є і людина ще в ній (інакше — group_not_found, а не помилка ключа). */
async function lockMember(tx: Tx, groupId: string, userId: string): Promise<boolean> {
  const [group] = await tx.select({ id: familyGroup.id }).from(familyGroup).where(eq(familyGroup.id, groupId)).for('update');
  if (group === undefined) return false;
  const [member] = await tx
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)));
  return member !== undefined;
}

/** Учасники групи всередині транзакції: перевірка «про кого» саме на мить запису. */
async function memberIds(tx: Tx, groupId: string): Promise<Set<string>> {
  const rows = await tx.select({ id: groupMember.userId }).from(groupMember).where(eq(groupMember.groupId, groupId));
  return new Set(rows.map((r) => r.id));
}

function onlyCurrent(cards: Map<string, ProfileCard>, ids: Set<string>): Map<string, ProfileCard> {
  return new Map([...cards].filter(([id]) => ids.has(id)));
}

export async function createItem(
  db: Db,
  groupId: string,
  authorId: string,
  input: GroupItemInput,
  now: Date,
): Promise<{ ok: true; item: GroupItem } | Fail<'group_not_found' | 'group_items_full' | 'about_not_member'>> {
  // Картки — до транзакції: ensureProfile ходить через db, а не через tx.
  const cards = await memberCards(db, groupId);
  const outcome = await db.transaction(async (tx) => {
    if (!(await lockMember(tx, groupId, authorId))) return { ok: false, error: 'group_not_found' } as const;
    const members = onlyCurrent(cards, await memberIds(tx, groupId));
    const about = storedAbout(input.about, members, []);
    if (about === null) return { ok: false, error: 'about_not_member' } as const;
    const [used] = await tx.select({ n: count() }).from(groupItem).where(eq(groupItem.groupId, groupId));
    if (Number(used?.n ?? 0) >= GROUP_LIMITS.itemsMax) return { ok: false, error: 'group_items_full' } as const;
    const [row] = await tx
      .insert(groupItem)
      .values({ groupId, authorId, ...input, about, createdAt: now, updatedAt: now })
      .returning();
    return { ok: true, row, members } as const;
  });
  if (!outcome.ok) return outcome;
  return { ok: true, item: toView(outcome.row, outcome.members, authorId, 'member') };
}

async function visibleItem(db: Db | Tx, groupId: string, itemId: string, viewerId: string): Promise<ItemRow | null> {
  if (!UUID.test(itemId)) return null;
  const [row] = await db
    .select()
    .from(groupItem)
    .where(and(eq(groupItem.id, itemId), eq(groupItem.groupId, groupId), visibleItemsWhere(viewerId)));
  return row ?? null;
}

export async function updateItem(
  db: Db,
  groupId: string,
  itemId: string,
  userId: string,
  input: GroupItemInput,
  now: Date,
): Promise<{ ok: true; item: GroupItem } | Fail<'group_not_found' | 'item_not_found' | 'not_author' | 'about_not_member'>> {
  const cards = await memberCards(db, groupId);
  const outcome = await db.transaction(async (tx) => {
    if (!(await lockMember(tx, groupId, userId))) return { ok: false, error: 'group_not_found' } as const;
    const existing = await visibleItem(tx, groupId, itemId, userId);
    if (existing === null) return { ok: false, error: 'item_not_found' } as const;
    if (existing.authorId !== userId) return { ok: false, error: 'not_author' } as const;
    const members = onlyCurrent(cards, await memberIds(tx, groupId));
    const about = storedAbout(input.about, members, existing.about);
    if (about === null) return { ok: false, error: 'about_not_member' } as const;
    const [row] = await tx
      .update(groupItem)
      .set({ ...input, about, updatedAt: now })
      .where(eq(groupItem.id, itemId))
      .returning();
    return { ok: true, row, members } as const;
  });
  if (!outcome.ok) return outcome;
  return { ok: true, item: toView(outcome.row, outcome.members, userId, 'member') };
}

export async function deleteItem(
  db: Db,
  groupId: string,
  itemId: string,
  userId: string,
  role: GroupRole,
): Promise<{ ok: true } | Fail<'item_not_found' | 'not_author'>> {
  const existing = await visibleItem(db, groupId, itemId, userId);
  if (existing === null) return { ok: false, error: 'item_not_found' };
  if (existing.authorId !== userId && role !== 'owner') return { ok: false, error: 'not_author' };
  await db.delete(groupItem).where(eq(groupItem.id, itemId));
  return { ok: true };
}

