import { GROUP_CODE, type GroupInput } from '@quiz/shared';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { familyGroup, follow, groupInvite, groupItem, groupMember, user } from './db/schema';
import {
  acceptInvite,
  cancelInvite,
  createGroup,
  declineInvite,
  deleteGroup,
  groupDetail,
  invitesFor,
  inviteFriends,
  joinByCode,
  joinPreview,
  leaveGroup,
  listGroups,
  membership,
  newInviteCode,
  refreshCode,
  removeMember,
  transferOwner,
  updateGroup,
} from './group-store';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const T = new Date('2026-11-14T10:00:00.000Z');
const later = (minutes: number) => new Date(T.getTime() + minutes * 60_000);
const kvitkovi: GroupInput = { name: 'Родина Квіткових', emoji: '🌻', description: 'Усі, хто збирається на свята в бабусі' };

beforeAll(async () => {
  db = await createTestDb();
});

const nicks = new Map<string, string | null>();
/** Ніки в одній базі унікальні: друга «Оля» стає «Оля 2», тож тести звіряють нік з профілем. */
const nick = (id: string) => nicks.get(id) ?? null;

async function person(name: string) {
  n += 1;
  const id = `gs${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  nicks.set(id, (await ensureProfile(db, id))?.nickname ?? null);
  return id;
}

async function befriend(from: string, to: string) {
  await db.insert(follow).values({ followerId: from, followeeId: to });
}

async function newGroup(ownerId: string, input: GroupInput = kvitkovi, now = T) {
  const created = await createGroup(db, ownerId, input, now);
  if (!created.ok) throw new Error(created.error);
  return created.id;
}

async function codeOf(groupId: string) {
  const [row] = await db.select({ code: familyGroup.inviteCode }).from(familyGroup).where(eq(familyGroup.id, groupId));
  return row.code;
}

/** Рядки людей напряму, щоб швидко дійти до межі. */
async function fillGroup(groupId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const id = await person(`Гість ${n + 1}`);
    await db.insert(groupMember).values({ groupId, userId: id, role: 'member', joinedAt: later(i + 1) });
  }
}

describe('newInviteCode', () => {
  it('gives 10 characters from the alphabet without look-alikes', () => {
    for (let i = 0; i < 50; i++) expect(newInviteCode()).toMatch(GROUP_CODE);
    expect(newInviteCode((size) => new Uint8Array(size))).toBe('aaaaaaaaaa');
  });
});

describe('group store (12k)', () => {
  it('creates a group: the creator owns it and the code fits; the 11th group is refused', async () => {
    const olia = await person('Оля');
    const id = await newGroup(olia);
    expect(await membership(db, id, olia)).toBe('owner');
    expect(await codeOf(id)).toMatch(GROUP_CODE);
    const detail = await groupDetail(db, id, olia);
    expect(detail).toMatchObject({ name: 'Родина Квіткових', emoji: '🌻', role: 'owner', people: 1, items: 0 });
    for (let i = 0; i < 9; i++) await newGroup(olia, { ...kvitkovi, name: `Група ${i}` });
    expect(await createGroup(db, olia, kvitkovi, T)).toEqual({ ok: false, error: 'too_many_groups' });
  });

  it('lists groups newest join first; the detail puts the owner first and shows the code and invites only to the owner', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const ira = await person('Іра');
    const stranger = await person('Віра');
    const first = await newGroup(olia, kvitkovi, T);
    await joinByCode(db, await codeOf(first), petro, later(5));
    await joinByCode(db, await codeOf(first), ira, later(3));
    const second = await newGroup(petro, { name: 'Друзі з класу', emoji: '🎓', description: '' }, later(10));

    const page = await listGroups(db, petro);
    expect(page.groups.map((g) => g.id)).toEqual([second, first]);
    expect(page.groups[1]).toMatchObject({ role: 'member', people: 3 });

    const owner = await groupDetail(db, first, olia);
    expect(owner?.members.map((m) => m.id)).toEqual([olia, ira, petro]);
    expect(owner?.members[0]).toMatchObject({ role: 'owner', you: true, nickname: nick(olia) });
    expect(owner?.inviteCode).toMatch(GROUP_CODE);
    expect(owner?.pending).toEqual([]);

    const member = await groupDetail(db, first, petro);
    expect(member?.members.find((m) => m.id === petro)?.you).toBe(true);
    expect(member).not.toHaveProperty('inviteCode');
    expect(member).not.toHaveProperty('pending');
    expect(await groupDetail(db, first, stranger)).toBeNull();
    expect(await membership(db, first, stranger)).toBeNull();
  });

  it('updates the name, badge and description', async () => {
    const olia = await person('Оля');
    const id = await newGroup(olia);
    await updateGroup(db, id, { name: 'Квіткові', emoji: '🏡', description: '' }, later(1));
    expect(await groupDetail(db, id, olia)).toMatchObject({ name: 'Квіткові', emoji: '🏡', description: '' });
  });

  it('joins by link once; a fresh code kills the old link', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const id = await newGroup(olia);
    const code = await codeOf(id);

    const preview = await joinPreview(db, code, petro);
    expect(preview).toMatchObject({ id, name: 'Родина Квіткових', member: false, people: 1, owner: { id: olia, nickname: nick(olia) } });
    expect(await joinByCode(db, code, petro, later(1))).toEqual({ ok: true, id });
    expect(await joinByCode(db, code, petro, later(2))).toEqual({ ok: true, id });
    expect(await db.select().from(groupMember).where(eq(groupMember.groupId, id))).toHaveLength(2);
    expect((await joinPreview(db, code, petro))?.member).toBe(true);

    const fresh = await refreshCode(db, id, later(3));
    expect(fresh).toMatch(GROUP_CODE);
    expect(fresh).not.toBe(code);
    expect(await joinPreview(db, code, petro)).toBeNull();
    expect(await joinByCode(db, code, petro, later(4))).toEqual({ ok: false, error: 'group_not_found' });
    expect(await joinPreview(db, 'not a code', petro)).toBeNull();
  });

  it('stops at 30 people, by link and by invite, and at 10 groups per person', async () => {
    const olia = await person('Оля');
    const ira = await person('Іра');
    const late = await person('Марко');
    const id = await newGroup(olia);
    await befriend(olia, ira);
    expect((await inviteFriends(db, id, olia, [ira], T)).ok).toBe(true);
    await fillGroup(id, 29);
    expect(await joinByCode(db, await codeOf(id), late, later(60))).toEqual({ ok: false, error: 'group_full' });
    expect(await acceptInvite(db, id, ira, later(60))).toEqual({ ok: false, error: 'group_full' });

    const busy = await person('Дана');
    for (let i = 0; i < 10; i++) await newGroup(busy, { ...kvitkovi, name: `Своя ${i}` });
    const other = await newGroup(olia, { ...kvitkovi, name: 'Інша' });
    expect(await joinByCode(db, await codeOf(other), busy, later(61))).toEqual({ ok: false, error: 'too_many_groups' });
  });

  it('invites only the owner’s friends who are not in the group yet', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const ira = await person('Іра');
    const viktor = await person('Віктор');
    const id = await newGroup(olia);
    await joinByCode(db, await codeOf(id), petro, later(1));
    await befriend(olia, ira);
    await befriend(olia, petro);
    await befriend(viktor, olia);

    const sent = await inviteFriends(db, id, olia, [ira, viktor, olia, petro], later(2));
    expect(sent).toEqual({ ok: true, invited: [{ id: ira, nickname: nick(ira), avatar: null }] });
    expect(await invitesFor(db, viktor)).toEqual([]);
    const cards = await invitesFor(db, ira);
    expect(cards).toEqual([
      { group: { id, name: 'Родина Квіткових', emoji: '🌻', people: 2 }, from: { id: olia, nickname: nick(olia), avatar: null }, at: later(2).toISOString() },
    ]);
    expect((await groupDetail(db, id, olia))?.pending).toEqual([{ user: { id: ira, nickname: nick(ira), avatar: null }, at: later(2).toISOString() }]);
    expect((await listGroups(db, ira)).invites).toHaveLength(1);

    expect(await acceptInvite(db, id, ira, later(3))).toEqual({ ok: true });
    expect(await membership(db, id, ira)).toBe('member');
    expect(await invitesFor(db, ira)).toEqual([]);
    expect(await acceptInvite(db, id, ira, later(4))).toEqual({ ok: false, error: 'invite_not_found' });
  });

  it('a declined invite is gone; joining by link also clears the invite; cancel works; 31 waiting invites are refused', async () => {
    const olia = await person('Оля');
    const ira = await person('Іра');
    const marko = await person('Марко');
    const dana = await person('Дана');
    const id = await newGroup(olia);
    for (const friend of [ira, marko, dana]) await befriend(olia, friend);
    await inviteFriends(db, id, olia, [ira, marko, dana], later(1));

    await declineInvite(db, id, ira);
    expect(await invitesFor(db, ira)).toEqual([]);
    expect(await acceptInvite(db, id, ira, later(2))).toEqual({ ok: false, error: 'invite_not_found' });

    await joinByCode(db, await codeOf(id), marko, later(3));
    expect(await invitesFor(db, marko)).toEqual([]);

    await cancelInvite(db, id, dana);
    expect(await invitesFor(db, dana)).toEqual([]);

    const many: string[] = [];
    for (let i = 0; i < 31; i++) {
      const friend = await person(`Друг ${i}`);
      await befriend(olia, friend);
      many.push(friend);
    }
    expect((await inviteFriends(db, id, olia, many.slice(0, 30), later(4))).ok).toBe(true);
    expect(await inviteFriends(db, id, olia, many.slice(30), later(5))).toEqual({ ok: false, error: 'invites_full' });
  });

  it('the owner hands over before leaving; removing checks the person', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const ira = await person('Іра');
    const stranger = await person('Віра');
    const id = await newGroup(olia);
    await joinByCode(db, await codeOf(id), petro, later(1));
    await joinByCode(db, await codeOf(id), ira, later(2));

    expect(await leaveGroup(db, id, olia)).toEqual({ ok: false, error: 'owner_must_transfer' });
    expect(await removeMember(db, id, olia, olia)).toEqual({ ok: false, error: 'owner_must_transfer' });
    expect(await transferOwner(db, id, olia, stranger)).toEqual({ ok: false, error: 'member_not_found' });
    expect(await transferOwner(db, id, olia, petro)).toEqual({ ok: true });
    expect(await membership(db, id, petro)).toBe('owner');
    expect(await membership(db, id, olia)).toBe('member');
    expect(await leaveGroup(db, id, olia)).toEqual({ ok: true });
    expect(await membership(db, id, olia)).toBeNull();

    expect(await removeMember(db, id, petro, stranger)).toEqual({ ok: false, error: 'member_not_found' });
    expect(await removeMember(db, id, petro, ira)).toEqual({ ok: true });
    expect(await membership(db, id, ira)).toBeNull();
  });

  it('a group that lost its owner gets the earliest member; a group with nobody left is gone', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const ira = await person('Іра');
    const id = await newGroup(olia);
    await joinByCode(db, await codeOf(id), ira, later(5));
    await joinByCode(db, await codeOf(id), petro, later(1));

    await db.delete(user).where(eq(user.id, olia));
    expect(await membership(db, id, ira)).toBe('member');
    expect(await membership(db, id, petro)).toBe('owner');
    expect((await groupDetail(db, id, ira))?.members.map((m) => [m.id, m.role])).toEqual([
      [petro, 'owner'],
      [ira, 'member'],
    ]);

    const code = await codeOf(id);
    await db.delete(user).where(eq(user.id, petro));
    await db.delete(user).where(eq(user.id, ira));
    const outsider = await person('Марко');
    expect(await joinPreview(db, code, outsider)).toBeNull();
    expect(await db.select().from(familyGroup).where(eq(familyGroup.id, id))).toEqual([]);
  });

  it('counts only the records the viewer can see', async () => {
    const olia = await person('Оля');
    const petro = await person('Петро');
    const id = await newGroup(olia);
    await joinByCode(db, await codeOf(id), petro, later(1));
    await db.insert(groupItem).values([
      { groupId: id, authorId: petro, kind: 'fact', text: 'Бабуся Ніна свистить двома пальцями' },
      { groupId: id, authorId: petro, kind: 'fact', text: 'Оля колись пекла торт без борошна', about: [{ kind: 'member', userId: olia, name: 'Оля' }], surprise: true },
    ]);
    expect((await listGroups(db, olia)).groups.find((g) => g.id === id)?.items).toBe(1);
    expect((await groupDetail(db, id, olia))?.items).toBe(1);
    expect((await listGroups(db, petro)).groups.find((g) => g.id === id)?.items).toBe(2);
    expect((await groupDetail(db, id, petro))?.items).toBe(2);
  });

  it('deleting a group takes members, invites and records', async () => {
    const olia = await person('Оля');
    const ira = await person('Іра');
    const id = await newGroup(olia);
    await befriend(olia, ira);
    await inviteFriends(db, id, olia, [ira], later(1));
    await db.insert(groupItem).values({ groupId: id, authorId: olia, kind: 'fact', text: 'Бабуся Ніна свистить двома пальцями' });

    await deleteGroup(db, id);
    expect(await db.select().from(groupMember).where(eq(groupMember.groupId, id))).toEqual([]);
    expect(await db.select().from(groupInvite).where(and(eq(groupInvite.groupId, id), eq(groupInvite.userId, ira)))).toEqual([]);
    expect(await db.select().from(groupItem).where(eq(groupItem.groupId, id))).toEqual([]);
    expect(await groupDetail(db, id, olia)).toBeNull();
  });
});
