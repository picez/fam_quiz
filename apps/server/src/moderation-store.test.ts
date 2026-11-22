import { randomUUID } from 'node:crypto';
import { ADMIN_PAGE_SIZE, BOT_USER_ID, type FeedData, type GroupInput } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { adminAction, familyGroup, feedEvent, groupInvite, groupItem, groupMember, inboxItem, profile, user, userBan, userLike } from './db/schema';
import { createGroup, membership, roleIn, transferOwner } from './group-store';
import {
  adminAddMember,
  adminDeleteGroup,
  adminFeed,
  adminGroup,
  adminGroups,
  adminRemoveMember,
  adminTransferOwner,
  setFeedHidden,
  setGroupHidden,
  setItemHidden,
} from './moderation-store';
import { createTestDb } from './testing/test-db';

const NOW = new Date('2026-11-20T12:00:00.000Z');

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: 'adm', name: 'Адмін', email: 'adm@example.com' });
  await db.insert(profile).values({ userId: 'adm', nickname: 'Адмін', nicknameKey: 'адмін' });
});

async function person(nickname: string) {
  n += 1;
  const id = `u${n}`;
  await db.insert(user).values({ id, name: nickname, email: `${id}@example.com` });
  await db.insert(profile).values({ userId: id, nickname, nicknameKey: `${nickname.toLowerCase()}${n}` });
  return id;
}

let keys = 0;
async function event(userId: string, data: FeedData, at: Date, gameId: string | null = null) {
  keys += 1;
  const [row] = await db
    .insert(feedEvent)
    .values({ key: `${data.kind}:m:${keys}`, userId, kind: data.kind as never, gameId, data, at, createdAt: at })
    .returning();
  return row;
}

const level: FeedData = { kind: 'level', level: 3 };
const prize: FeedData = { kind: 'prize', place: 1 as never, name: 'Кубок', title: 'Писанки', nickTitle: null };

describe('moderation store: feed (63)', () => {
  it('adminFeed lists every event 50 a page, by person and kind, hidden included', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    for (let i = 0; i < 49; i++) await event(olya, level, new Date(NOW.getTime() - (i + 10) * 60_000));
    const p1 = await event(olya, prize, new Date(NOW.getTime() - 5 * 60_000));
    const p2 = await event(olya, prize, new Date(NOW.getTime() - 6 * 60_000));
    const ep = await event(petro, level, new Date(NOW.getTime() - 100 * 60_000));
    await db.insert(userBan).values({ userId: petro, reason: null, bannedBy: 'adm', bannedAt: NOW });
    await db.insert(userLike).values({ userId: petro, kind: 'event', targetUserId: olya, eventKey: p1.key, createdAt: NOW });
    await db.insert(userLike).values({ userId: petro, kind: 'event', targetUserId: olya, eventKey: p2.key, createdAt: NOW });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: p2.id, hidden: true, now: NOW })).toEqual({ ok: true, changed: true });

    const first = await adminFeed(db, { page: 1 });
    expect(first.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first).toMatchObject({ total: 52, page: 1, pages: 2 });
    expect(first.rows[0]).toEqual({ id: p1.id, at: p1.at.toISOString(), who: { id: olya, nickname: 'Оля' }, data: prize, likes: 1, hidden: null });
    expect(first.rows[1]).toEqual({ id: p2.id, at: p2.at.toISOString(), who: { id: olya, nickname: 'Оля' }, data: prize, likes: 0, hidden: { at: NOW.toISOString() } });
    const second = await adminFeed(db, { page: 2 });
    expect(second.rows).toHaveLength(2);
    expect(second.rows[1].id).toBe(ep.id);
    expect(JSON.stringify(first)).not.toContain('@');

    const byPetro = await adminFeed(db, { page: 1, user: petro });
    expect(byPetro).toMatchObject({ total: 1, rows: [{ id: ep.id, who: { id: petro, nickname: 'Петро' } }] });
    const prizes = await adminFeed(db, { page: 1, kind: 'prize' });
    expect(prizes.rows.map((r) => r.id)).toEqual([p1.id, p2.id]);
    expect(prizes.rows.every((r) => r.data.kind === 'prize')).toBe(true);
  });

  it('setFeedHidden twice changes once and logs once', async () => {
    const olya = await person('Оля');
    const ev = await event(olya, level, new Date(NOW.getTime() - 60_000), randomUUID());
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: true, now: NOW })).toEqual({ ok: true, changed: true });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: true, now: NOW })).toEqual({ ok: true, changed: false });
    const [row] = await db.select().from(feedEvent).where(eq(feedEvent.id, ev.id));
    expect(row.hiddenAt).toEqual(NOW);
    const logged = (await db.select().from(adminAction).where(eq(adminAction.targetUserId, olya))).filter((a) => a.kind === 'feed_hide');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ adminId: 'adm', adminLabel: 'Адмін', targetLabel: 'Оля', details: { feed: { kind: 'level', level: 3 } } });

    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: false, now: NOW })).toEqual({ ok: true, changed: true });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: ev.id, hidden: false, now: NOW })).toEqual({ ok: true, changed: false });
    const [shown] = await db.select().from(feedEvent).where(eq(feedEvent.id, ev.id));
    expect(shown.hiddenAt).toBeNull();
    const shows = (await db.select().from(adminAction).where(eq(adminAction.targetUserId, olya))).filter((a) => a.kind === 'feed_show');
    expect(shows).toHaveLength(1);

    expect(await setFeedHidden(db, { adminId: 'adm', eventId: randomUUID(), hidden: true, now: NOW })).toEqual({ ok: false, error: 'not_found' });
    expect(await setFeedHidden(db, { adminId: 'adm', eventId: 'not-a-uuid', hidden: true, now: NOW })).toEqual({ ok: false, error: 'not_found' });
  });
});

const T = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

async function group(ownerId: string, name: string, at = NOW) {
  const input: GroupInput = { name, emoji: '🌻', description: '' };
  const created = await createGroup(db, ownerId, input, at);
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

async function join(groupId: string, userId: string, at: Date) {
  await db.insert(groupMember).values({ groupId, userId, role: 'member', joinedAt: at });
}

async function record(groupId: string, authorId: string | null, text: string, at: Date, extra: Partial<typeof groupItem.$inferInsert> = {}) {
  const [row] = await db.insert(groupItem).values({ groupId, authorId, kind: 'fact', text, createdAt: at, updatedAt: at, ...extra }).returning();
  return row;
}

const logOf = async (kind: string) => (await db.select().from(adminAction)).filter((a) => a.kind === kind);

describe('moderation store: groups (63)', () => {
  it('adminGroups searches by group or owner nickname', async () => {
    const olya = await person('Оля');
    const ganna = await person('Ганна');
    const petro = await person('Петро');
    const myron = await person('Мирон');
    const polissia = await group(olya, 'Поліські вечори', T(1));
    const karpaty = await group(ganna, 'Карпатська родина', T(2));
    await join(polissia, petro, T(3));
    await join(polissia, myron, T(4));
    await db.insert(userBan).values({ userId: myron, reason: null, bannedBy: 'adm', bannedAt: NOW });
    await record(polissia, petro, 'Тато ловить щук руками', T(5));
    await record(polissia, olya, 'Бабуся співає колядки', T(6), { hiddenAt: T(7) });
    await setGroupHidden(db, { adminId: 'adm', groupId: karpaty, hidden: true, reason: 'Спам', now: T(8) });

    const all = await adminGroups(db, { page: 1 });
    expect(all).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(all.rows.map((r) => r.id)).toEqual([karpaty, polissia]);
    expect(all.rows[1]).toEqual({
      id: polissia,
      name: 'Поліські вечори',
      emoji: '🌻',
      owner: { id: olya, nickname: 'Оля' },
      members: 3,
      items: 2,
      createdAt: T(1).toISOString(),
      hidden: null,
    });
    expect(all.rows[0]).toMatchObject({ owner: { id: ganna, nickname: 'Ганна' }, members: 1, items: 0, hidden: { at: T(8).toISOString(), reason: 'Спам' } });
    expect(JSON.stringify(all)).not.toContain('@');

    expect((await adminGroups(db, { q: 'карпат', page: 1 })).rows.map((r) => r.id)).toEqual([karpaty]);
    expect((await adminGroups(db, { q: 'оля', page: 1 })).rows.map((r) => r.id)).toEqual([polissia]);
    expect(await adminGroups(db, { q: '%', page: 1 })).toMatchObject({ total: 0, rows: [] });
  });

  it('adminGroup shows all members and records 50 a page, surprises and hidden too', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    const myron = await person('Мирон');
    const id = await group(olya, 'Родина Квіткових', T(1));
    await join(id, petro, T(2));
    await join(id, myron, T(3));
    await db.insert(userBan).values({ userId: myron, reason: null, bannedBy: 'adm', bannedAt: NOW });
    for (let i = 0; i < 48; i++) await record(id, petro, `Факт ${i}`, T(10 + i));
    const surprise = await record(id, petro, 'Оля колись спекла торт без борошна', T(100), {
      surprise: true,
      about: [{ kind: 'member', userId: olya, name: 'Оля' }],
    });
    const hidden = await record(id, olya, 'Дядько Іван співає в хорі', T(101), { hiddenAt: T(102) });
    const orphan = await record(id, null, 'Дід Микола робив вулики', T(103));

    const card = await adminGroup(db, id, 1);
    expect(card).not.toBeNull();
    if (card === null) return;
    expect(card.group).toMatchObject({ id, name: 'Родина Квіткових', members: 3, items: 51, hidden: null, owner: { id: olya } });
    expect(card.members).toEqual([
      { id: olya, nickname: 'Оля', role: 'owner', joinedAt: T(1).toISOString(), banned: false },
      { id: petro, nickname: 'Петро', role: 'member', joinedAt: T(2).toISOString(), banned: false },
      { id: myron, nickname: 'Мирон', role: 'member', joinedAt: T(3).toISOString(), banned: true },
    ]);
    expect(card.items).toMatchObject({ total: 51, page: 1, pages: 2 });
    expect(card.items.rows).toHaveLength(ADMIN_PAGE_SIZE);
    expect(card.items.rows.slice(0, 3)).toEqual([
      { id: orphan.id, kind: 'fact', text: 'Дід Микола робив вулики', author: null, surprise: false, createdAt: T(103).toISOString(), hidden: false },
      { id: hidden.id, kind: 'fact', text: 'Дядько Іван співає в хорі', author: 'Оля', surprise: false, createdAt: T(101).toISOString(), hidden: true },
      { id: surprise.id, kind: 'fact', text: 'Оля колись спекла торт без борошна', author: 'Петро', surprise: true, createdAt: T(100).toISOString(), hidden: false },
    ]);
    const second = await adminGroup(db, id, 2);
    expect(second?.items.rows.map((r) => r.text)).toEqual(['Факт 0']);
    expect(JSON.stringify(card)).not.toContain('@');
    expect(await adminGroup(db, '99999999-9999-4999-8999-999999999999', 1)).toBeNull();
    expect(await adminGroup(db, 'not-a-uuid', 1)).toBeNull();
  });

  it('hiding a group twice with the same reason changes once; another reason updates it; restore clears both', async () => {
    const olya = await person('Оля');
    const id = await group(olya, 'Поліські вечори');
    const hide = (reason: string | null) => setGroupHidden(db, { adminId: 'adm', groupId: id, hidden: true, reason, now: T(1) });
    const before = (await logOf('group_hide')).length;
    expect(await hide('Образлива назва')).toEqual({ ok: true, changed: true });
    expect(await hide('Образлива назва')).toEqual({ ok: true, changed: false });
    expect(await hide('Спам')).toEqual({ ok: true, changed: true });
    const [row] = await db.select().from(familyGroup).where(eq(familyGroup.id, id));
    expect(row).toMatchObject({ hiddenAt: T(1), hiddenReason: 'Спам' });
    const hides = (await logOf('group_hide')).slice(before);
    expect(hides).toHaveLength(2);
    expect(hides[0]).toMatchObject({ targetUserId: olya, targetLabel: 'Оля', details: { title: 'Поліські вечори', reason: 'Образлива назва' } });

    const restore = () => setGroupHidden(db, { adminId: 'adm', groupId: id, hidden: false, reason: null, now: T(2) });
    expect(await restore()).toEqual({ ok: true, changed: true });
    expect(await restore()).toEqual({ ok: true, changed: false });
    const [back] = await db.select().from(familyGroup).where(eq(familyGroup.id, id));
    expect(back).toMatchObject({ hiddenAt: null, hiddenReason: null });
    expect((await logOf('group_restore')).filter((a) => a.targetUserId === olya)).toHaveLength(1);
    expect(await setGroupHidden(db, { adminId: 'adm', groupId: '99999999-9999-4999-8999-999999999999', hidden: true, reason: null, now: T(3) })).toEqual({
      ok: false,
      error: 'group_not_found',
    });
  });

  it('an admin removes a member but never the owner', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    const taras = await person('Тарас');
    const id = await group(olya, 'Поліські вечори');
    await join(id, petro, T(1));
    await db.insert(groupInvite).values({ groupId: id, userId: petro, invitedBy: olya, createdAt: T(2) });

    expect(await adminRemoveMember(db, { adminId: 'adm', groupId: id, userId: petro, now: T(3) })).toEqual({ ok: true, changed: true });
    expect(await db.select().from(groupMember).where(and(eq(groupMember.groupId, id), eq(groupMember.userId, petro)))).toEqual([]);
    expect(await db.select().from(groupInvite).where(and(eq(groupInvite.groupId, id), eq(groupInvite.userId, petro)))).toEqual([]);
    expect(await adminRemoveMember(db, { adminId: 'adm', groupId: id, userId: olya, now: T(4) })).toEqual({ ok: false, error: 'owner_must_transfer' });
    expect(await adminRemoveMember(db, { adminId: 'adm', groupId: id, userId: taras, now: T(4) })).toEqual({ ok: false, error: 'member_not_found' });
    expect(await membership(db, id, olya)).toBe('owner');
    const removed = (await logOf('group_member_remove')).filter((a) => a.details.title === 'Поліські вечори' && a.targetUserId === petro);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ adminId: 'adm', targetLabel: 'Петро' });
    expect((await logOf('group_member_remove')).filter((a) => a.targetUserId === olya || a.targetUserId === taras)).toEqual([]);
  });

  it('an admin passes the group to a member, not to the banned or the bot', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    const myron = await person('Мирон');
    const ira = await person('Іра');
    await db.insert(user).values({ id: BOT_USER_ID, name: 'Бот', email: 'bot@example.com' }).onConflictDoNothing();
    const id = await group(olya, 'Поліські вечори');
    await join(id, myron, T(1));
    await join(id, petro, T(2));
    await join(id, BOT_USER_ID, T(3));
    await db.insert(userBan).values({ userId: myron, reason: null, bannedBy: 'adm', bannedAt: NOW });

    expect(await adminTransferOwner(db, { adminId: 'adm', groupId: id, toId: myron, now: T(4) })).toEqual({ ok: false, error: 'member_not_found' });
    expect(await adminTransferOwner(db, { adminId: 'adm', groupId: id, toId: BOT_USER_ID, now: T(4) })).toEqual({ ok: false, error: 'member_not_found' });
    expect(await adminTransferOwner(db, { adminId: 'adm', groupId: id, toId: ira, now: T(4) })).toEqual({ ok: false, error: 'member_not_found' });
    expect(await adminTransferOwner(db, { adminId: 'adm', groupId: id, toId: olya, now: T(4) })).toEqual({ ok: false, error: 'member_not_found' });
    expect(await adminTransferOwner(db, { adminId: 'adm', groupId: id, toId: petro, now: T(5) })).toEqual({ ok: true, changed: true });

    const owners = await db.select().from(groupMember).where(and(eq(groupMember.groupId, id), eq(groupMember.role, 'owner')));
    expect(owners.map((o) => o.userId)).toEqual([petro]);
    expect(await membership(db, id, petro)).toBe('owner');
    expect(await membership(db, id, olya)).toBe('member');
    const moved = (await logOf('group_owner_transfer')).filter((a) => a.details.title === 'Поліські вечори');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ targetUserId: petro, targetLabel: 'Петро', details: { title: 'Поліські вечори', text: 'Оля' } });
    // Власник сам передає далі, як і раніше.
    expect(await transferOwner(db, id, petro, olya)).toEqual({ ok: true });
    expect(await membership(db, id, olya)).toBe('owner');
  });

  it('deleting a group needs its exact name', async () => {
    const olya = await person('Оля');
    const id = await group(olya, 'Поліські вечори');
    expect(await adminDeleteGroup(db, { adminId: 'adm', groupId: id, name: 'поліські вечори', now: T(1) })).toEqual({ ok: false, error: 'group_name_mismatch' });
    expect(await db.select().from(familyGroup).where(eq(familyGroup.id, id))).toHaveLength(1);
    expect(await adminDeleteGroup(db, { adminId: 'adm', groupId: id, name: '  Поліські вечори ', now: T(2) })).toEqual({ ok: true, changed: true });
    expect(await db.select().from(familyGroup).where(eq(familyGroup.id, id))).toEqual([]);
    const deleted = (await logOf('group_delete')).filter((a) => a.targetUserId === olya);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ adminId: 'adm', details: { title: 'Поліські вечори' } });
    expect(await adminDeleteGroup(db, { adminId: 'adm', groupId: id, name: 'Поліські вечори', now: T(3) })).toEqual({ ok: false, error: 'group_not_found' });
  });

  it('hiding a record of another group is not found; hiding twice logs once', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    const mine = await group(olya, 'Поліські вечори');
    const other = await group(petro, 'Карпатська родина');
    const long = `Бабуся пече паляниці ${'й'.repeat(300)}`;
    const item = await record(mine, olya, long, T(1));
    expect(await setItemHidden(db, { adminId: 'adm', groupId: other, itemId: item.id, hidden: true, now: T(2) })).toEqual({ ok: false, error: 'item_not_found' });
    expect(await setItemHidden(db, { adminId: 'adm', groupId: mine, itemId: 'not-a-uuid', hidden: true, now: T(2) })).toEqual({ ok: false, error: 'item_not_found' });
    expect(await setItemHidden(db, { adminId: 'adm', groupId: mine, itemId: item.id, hidden: true, now: T(2) })).toEqual({ ok: true, changed: true });
    expect(await setItemHidden(db, { adminId: 'adm', groupId: mine, itemId: item.id, hidden: true, now: T(3) })).toEqual({ ok: true, changed: false });
    const [row] = await db.select().from(groupItem).where(eq(groupItem.id, item.id));
    expect(row.hiddenAt).toEqual(T(2));
    const hides = (await logOf('group_item_hide')).filter((a) => a.targetUserId === olya);
    expect(hides).toHaveLength(1);
    expect(hides[0].details).toEqual({ title: 'Поліські вечори', text: long.slice(0, 200) });
    expect(await setItemHidden(db, { adminId: 'adm', groupId: mine, itemId: item.id, hidden: false, now: T(4) })).toEqual({ ok: true, changed: true });
    expect((await logOf('group_item_show')).filter((a) => a.targetUserId === olya)).toHaveLength(1);
  });
});

describe('moderation store: adding (72)', () => {
  const inboxOf = (userId: string) => db.select().from(inboxItem).where(eq(inboxItem.userId, userId));

  it('an admin adds a stranger directly: a member at once, the invite gone, one log row, one inbox notice', async () => {
    const olya = await person('Оля');
    const petro = await person('Петро');
    const id = await group(olya, 'Карпатські вечори');
    await db.insert(groupInvite).values({ groupId: id, userId: petro, invitedBy: olya, createdAt: T(1) });

    expect(await adminAddMember(db, { adminId: 'adm', groupId: id, userId: petro, now: T(2) })).toEqual({ ok: true, changed: true, groupName: 'Карпатські вечори' });
    expect(await roleIn(db, id, petro)).toBe('member');
    const [joined] = await db.select().from(groupMember).where(and(eq(groupMember.groupId, id), eq(groupMember.userId, petro)));
    expect(joined.joinedAt).toEqual(T(2));
    expect(await db.select().from(groupInvite).where(and(eq(groupInvite.groupId, id), eq(groupInvite.userId, petro)))).toEqual([]);
    const added = (await logOf('group_member_add')).filter((a) => a.targetUserId === petro);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ adminId: 'adm', targetLabel: 'Петро', details: { title: 'Карпатські вечори' } });
    const inbox = await inboxOf(petro);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ kind: 'group_added', groupId: id, broadcastId: null, problemId: null, createdAt: T(2), readAt: null });
    // Власник групи нічого не отримує.
    expect(await inboxOf(olya)).toEqual([]);

    expect(await adminAddMember(db, { adminId: 'adm', groupId: id, userId: petro, now: T(3) })).toEqual({ ok: false, error: 'already_member' });
    expect((await logOf('group_member_add')).filter((a) => a.targetUserId === petro)).toHaveLength(1);
    expect(await inboxOf(petro)).toHaveLength(1);
  });

  it('refuses the unknown, the bot, the banned, a hidden or unknown group — no log, no notice', async () => {
    const olya = await person('Оля');
    const taras = await person('Тарас');
    const ivan = await person('Іван');
    const id = await group(olya, 'Поліські вечори');
    await db.insert(userBan).values({ userId: taras, reason: null, bannedBy: 'adm', bannedAt: NOW });
    const before = (await logOf('group_member_add')).length;

    expect(await adminAddMember(db, { adminId: 'adm', groupId: id, userId: 'nobody', now: T(1) })).toEqual({ ok: false, error: 'user_not_found' });
    expect(await adminAddMember(db, { adminId: 'adm', groupId: id, userId: BOT_USER_ID, now: T(1) })).toEqual({ ok: false, error: 'user_not_found' });
    expect(await adminAddMember(db, { adminId: 'adm', groupId: id, userId: taras, now: T(1) })).toEqual({ ok: false, error: 'member_banned' });
    expect(await adminAddMember(db, { adminId: 'adm', groupId: randomUUID(), userId: ivan, now: T(1) })).toEqual({ ok: false, error: 'group_not_found' });
    expect(await adminAddMember(db, { adminId: 'adm', groupId: 'not-a-uuid', userId: ivan, now: T(1) })).toEqual({ ok: false, error: 'group_not_found' });
    await setGroupHidden(db, { adminId: 'adm', groupId: id, hidden: true, reason: null, now: T(1) });
    expect(await adminAddMember(db, { adminId: 'adm', groupId: id, userId: ivan, now: T(2) })).toEqual({ ok: false, error: 'group_hidden' });

    expect(await roleIn(db, id, ivan)).toBeNull();
    expect(await roleIn(db, id, taras)).toBeNull();
    expect((await logOf('group_member_add')).length).toBe(before);
    expect(await inboxOf(ivan)).toEqual([]);
    expect(await inboxOf(taras)).toEqual([]);
  });

  it('keeps the limits: 30 people in a group, 10 shown groups a person; a hidden group takes no place', async () => {
    const olya = await person('Оля');
    const full = await group(olya, 'Велика родина');
    for (let i = 0; i < 29; i++) await join(full, await person(`Родич${i}`), T(1));
    const late = await person('Запізнілий');
    expect(await adminAddMember(db, { adminId: 'adm', groupId: full, userId: late, now: T(2) })).toEqual({ ok: false, error: 'group_full' });

    const busy = await person('Зайнятий');
    const own: string[] = [];
    for (let i = 0; i < 10; i++) own.push(await group(busy, `Гурток ${i}`));
    const target = await group(olya, 'Ще одна');
    expect(await adminAddMember(db, { adminId: 'adm', groupId: target, userId: busy, now: T(3) })).toEqual({ ok: false, error: 'member_too_many_groups' });
    await setGroupHidden(db, { adminId: 'adm', groupId: own[0], hidden: true, reason: null, now: T(3) });
    expect(await adminAddMember(db, { adminId: 'adm', groupId: target, userId: busy, now: T(4) })).toMatchObject({ ok: true, changed: true });
    expect(await inboxOf(late)).toEqual([]);
  });

  it('two adds of one person at once into two groups with one place left: exactly one wins', async () => {
    const olya = await person('Оля');
    const busy = await person('Майже повний');
    for (let i = 0; i < 9; i++) await group(busy, `Коло ${i}`);
    const a = await group(olya, 'Перша');
    const b = await group(olya, 'Друга');
    const results = await Promise.all([
      adminAddMember(db, { adminId: 'adm', groupId: a, userId: busy, now: T(1) }),
      adminAddMember(db, { adminId: 'adm', groupId: b, userId: busy, now: T(1) }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'member_too_many_groups' }]);
    expect(await inboxOf(busy)).toHaveLength(1);
  });
});
