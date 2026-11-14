import type { GroupItemInput } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { familyGroup, groupItem, groupMember, profile, user, userBan } from './db/schema';
import { createItem, deleteItem, listItems, updateItem } from './group-items';
import { createGroup, groupDetail, joinByCode, leaveGroup, listGroups } from './group-store';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const T = new Date('2026-11-14T10:00:00.000Z');
const later = (minutes: number) => new Date(T.getTime() + minutes * 60_000);
const nicks = new Map<string, string | null>();
const nick = (id: string) => nicks.get(id) ?? null;

beforeAll(async () => {
  db = await createTestDb();
});

async function person(name: string) {
  n += 1;
  const id = `gi${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  nicks.set(id, (await ensureProfile(db, id))?.nickname ?? null);
  return id;
}

/** «Родина Квіткових»: Оля — власниця, Петро й Іра — учасники. */
async function family() {
  const olia = await person('Оля');
  const petro = await person('Петро');
  const ira = await person('Іра');
  const created = await createGroup(db, olia, { name: 'Родина Квіткових', emoji: '🌻', description: '' }, T);
  if (!created.ok) throw new Error(created.error);
  const id = created.id;
  const [row] = await db.select({ code: familyGroup.inviteCode }).from(familyGroup).where(eq(familyGroup.id, id));
  await joinByCode(db, row.code, petro, later(1));
  await joinByCode(db, row.code, ira, later(2));
  return { id, code: row.code, olia, petro, ira };
}

const base: GroupItemInput = { kind: 'fact', text: '', about: [], answer: null, year: null, photo: null, surprise: false };

async function write(groupId: string, authorId: string, input: Partial<GroupItemInput>, now = later(10)) {
  const created = await createItem(db, groupId, authorId, { ...base, ...input }, now);
  if (!created.ok) throw new Error(created.error);
  return created.item;
}

const ids = async (groupId: string, viewerId: string, role: 'owner' | 'member' = 'member') =>
  (await listItems(db, groupId, viewerId, role)).map((item) => item.id);

describe('group records (12k)', () => {
  it('a story everyone sees: author, mine and who may delete', async () => {
    const { id, olia, petro, ira } = await family();
    const story = await write(id, petro, {
      kind: 'story',
      text: 'Як тато заблукав у лісі по гриби',
      about: [{ kind: 'name', name: 'тато' }],
      answer: 'Тато',
      year: 1998,
    });
    expect(story).toMatchObject({ kind: 'story', about: [{ kind: 'name', name: 'тато' }], answer: 'Тато', year: 1998, mine: true, canDelete: true });
    expect(story.author).toEqual({ id: petro, nickname: nick(petro), avatar: null });

    const [forOlia] = await listItems(db, id, olia, 'owner');
    expect(forOlia).toMatchObject({ id: story.id, mine: false, canDelete: true, author: { id: petro } });
    const [forIra] = await listItems(db, id, ira, 'member');
    expect(forIra).toMatchObject({ id: story.id, mine: false, canDelete: false });
    expect(await ids(id, petro)).toEqual([story.id]);
  });

  it('a surprise is hidden from the member it is about, even the owner, even after leaving and coming back', async () => {
    const { id, code, olia, petro, ira } = await family();
    await write(id, petro, { text: 'Бабуся Ніна свистить двома пальцями голосніше за всіх' }, later(5));
    const surprise = await write(id, petro, {
      text: 'Оля колись пекла торт без борошна',
      about: [{ kind: 'member', userId: olia }],
      surprise: true,
    });
    expect(surprise.about).toEqual([{ kind: 'member', userId: olia, name: nick(olia), former: false }]);

    expect(await ids(id, petro)).toContain(surprise.id);
    expect(await ids(id, ira)).toContain(surprise.id);
    expect(await ids(id, olia, 'owner')).not.toContain(surprise.id);
    expect((await groupDetail(db, id, olia))?.items).toBe(1);
    expect((await groupDetail(db, id, ira))?.items).toBe(2);
    expect((await listGroups(db, olia)).groups.find((g) => g.id === id)?.items).toBe(1);

    const edit = { ...base, text: 'Оля пекла торт без борошна й цукру', about: [{ kind: 'member' as const, userId: olia }], surprise: true };
    expect(await updateItem(db, id, surprise.id, olia, edit, later(11))).toEqual({ ok: false, error: 'item_not_found' });
    expect(await deleteItem(db, id, surprise.id, olia, 'owner')).toEqual({ ok: false, error: 'item_not_found' });

    // Передати керування й вийти — Оля мусить спершу віддати групу.
    await db.update(groupMember).set({ role: 'member' }).where(eq(groupMember.userId, olia));
    await db.update(groupMember).set({ role: 'owner' }).where(eq(groupMember.userId, petro));
    expect((await leaveGroup(db, id, olia)).ok).toBe(true);
    await joinByCode(db, code, olia, later(20));
    expect(await ids(id, olia)).not.toContain(surprise.id);

    const self = await write(id, petro, {
      text: 'Петро й Оля готують сюрприз',
      about: [
        { kind: 'member', userId: olia },
        { kind: 'member', userId: petro },
      ],
      surprise: true,
    });
    expect(await ids(id, petro)).toContain(self.id);
    expect(await ids(id, olia)).not.toContain(self.id);
  });

  it('«про кого» needs a member of the group; a member who left stays in an edited record with the saved name', async () => {
    const { id, olia, petro, ira } = await family();
    const stranger = await person('Віра');
    expect(await createItem(db, id, petro, { ...base, text: 'Щось', about: [{ kind: 'member', userId: stranger }] }, later(5))).toEqual({
      ok: false,
      error: 'about_not_member',
    });

    const aboutIra = await write(id, petro, { text: 'Іра співає в хорі', about: [{ kind: 'member', userId: ira }] });
    const iraNick = nick(ira);
    expect((await leaveGroup(db, id, ira)).ok).toBe(true);
    await db.update(profile).set({ nickname: 'Іра нова', nicknameKey: `іра нова ${n}` }).where(eq(profile.userId, ira));

    const edited = await updateItem(db, id, aboutIra.id, petro, { ...base, text: 'Іра співає в хорі вже десять років', about: [{ kind: 'member', userId: ira }] }, later(30));
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.item.text).toBe('Іра співає в хорі вже десять років');
    expect(edited.item.about).toEqual([{ kind: 'member', userId: ira, name: iraNick, former: true }]);
    const [shown] = await listItems(db, id, olia, 'owner');
    expect(shown.about).toEqual([{ kind: 'member', userId: ira, name: iraNick, former: true }]);

    expect(await createItem(db, id, petro, { ...base, text: 'Ще про Іру', about: [{ kind: 'member', userId: ira }] }, later(31))).toEqual({
      ok: false,
      error: 'about_not_member',
    });
  });

  it('only the author edits; the author or the owner deletes', async () => {
    const { id, olia, petro, ira } = await family();
    const item = await write(id, petro, { kind: 'quote', text: '„Хто рано встає, тому кава гаряча“ — дідусь Іван' });
    const edit = { ...base, kind: 'quote' as const, text: 'Інша цитата' };
    expect(await updateItem(db, id, item.id, ira, edit, later(11))).toEqual({ ok: false, error: 'not_author' });
    expect(await updateItem(db, id, item.id, olia, edit, later(11))).toEqual({ ok: false, error: 'not_author' });
    expect(await deleteItem(db, id, item.id, ira, 'member')).toEqual({ ok: false, error: 'not_author' });
    expect(await updateItem(db, id, 'not-a-uuid', petro, edit, later(11))).toEqual({ ok: false, error: 'item_not_found' });

    const updated = await updateItem(db, id, item.id, petro, edit, later(12));
    expect(updated.ok && updated.item).toMatchObject({ text: 'Інша цитата', updatedAt: later(12).toISOString(), createdAt: later(10).toISOString() });

    expect(await deleteItem(db, id, item.id, olia, 'owner')).toEqual({ ok: true });
    expect(await ids(id, petro)).toEqual([]);
    const own = await write(id, ira, { text: 'Свій запис' });
    expect(await deleteItem(db, id, own.id, ira, 'member')).toEqual({ ok: true });
  });

  it('a leaver’s records stay without an author; so do the records of a deleted account', async () => {
    const { id, olia, petro, ira } = await family();
    const byPetro = await write(id, petro, { text: 'Перша поїздка на море всією родиною', kind: 'date', year: 2005 });
    expect((await leaveGroup(db, id, petro)).ok).toBe(true);
    const [kept] = await listItems(db, id, olia, 'owner');
    expect(kept).toMatchObject({ id: byPetro.id, author: null, mine: false });

    const byIra = await write(id, ira, { text: 'Іра навчилася їздити на велосипеді' });
    await db.delete(user).where(eq(user.id, ira));
    const list = await listItems(db, id, olia, 'owner');
    expect(list.find((i) => i.id === byIra.id)).toMatchObject({ author: null });
    const [row] = await db.select().from(groupItem).where(eq(groupItem.id, byIra.id));
    expect(row.authorId).toBeNull();
  });

  it('writing after leaving or after the group is gone is group_not_found, not a crash', async () => {
    const { id, petro, olia } = await family();
    const story = await write(id, petro, { text: 'Свій запис' });
    expect((await leaveGroup(db, id, petro)).ok).toBe(true);
    expect(await createItem(db, id, petro, { ...base, text: 'Ще' }, later(20))).toEqual({ ok: false, error: 'group_not_found' });
    expect(await updateItem(db, id, story.id, petro, { ...base, text: 'Інше' }, later(20))).toEqual({ ok: false, error: 'group_not_found' });
    await db.delete(familyGroup).where(eq(familyGroup.id, id));
    expect(await createItem(db, id, olia, { ...base, text: 'Ще' }, later(21))).toEqual({ ok: false, error: 'group_not_found' });
  });

  it('a banned author shows as «вже не в групі», the record stays', async () => {
    const { id, olia, petro } = await family();
    const story = await write(id, petro, { text: 'Перша поїздка на море всією родиною' });
    await db.insert(userBan).values({ userId: petro, bannedAt: T });
    const [shown] = await listItems(db, id, olia, 'owner');
    expect(shown).toMatchObject({ id: story.id, author: null });
  });

  it('stops at 500 records', async () => {
    const { id, olia } = await family();
    await db.insert(groupItem).values(Array.from({ length: 500 }, (_, i) => ({ groupId: id, authorId: olia, kind: 'fact' as const, text: `Факт ${i}` })));
    expect(await createItem(db, id, olia, { ...base, text: 'Ще один' }, later(5))).toEqual({ ok: false, error: 'group_items_full' });
  });

  it('newest first', async () => {
    const { id, olia, petro } = await family();
    const first = await write(id, petro, { text: 'Перший' }, later(5));
    const second = await write(id, olia, { text: 'Другий' }, later(6));
    const third = await write(id, petro, { text: 'Третій' }, later(7));
    expect(await ids(id, olia, 'owner')).toEqual([third.id, second.id, first.id]);
  });
});

describe('group record uses in the list (12l)', () => {
  it('each record carries its uses; a surprise about me stays hidden even when marked', async () => {
    const { makeQuiz, single } = await import('@quiz/engine/testing');
    const { quiz } = await import('./db/schema');
    const { markUses } = await import('./group-uses');
    const { id, olia, petro } = await family();
    const story = await write(id, olia, { kind: 'story', text: 'Як тато заблукав у лісі по гриби', about: [{ kind: 'name', name: 'тато' }] });
    const fact = await write(id, olia, { text: 'Бабуся Ніна свистить двома пальцями' });
    const surprise = await write(id, petro, { text: 'Оля колись спекла торт без борошна', about: [{ kind: 'member', userId: olia }], surprise: true });
    const source = makeQuiz([single]);
    const [made] = await db
      .insert(quiz)
      .values({ ownerId: petro, title: 'Вікторина: Родина Квіткових', description: '', settings: source.settings, rounds: source.rounds })
      .returning();
    expect(await markUses(db, id, petro, { quizId: made.id, itemIds: [story.id, surprise.id] }, later(30))).toEqual({ ok: true, marked: 2 });

    const forOlia = await listItems(db, id, olia, 'owner');
    expect(forOlia.map((item) => item.id)).not.toContain(surprise.id);
    expect(forOlia.find((item) => item.id === story.id)?.uses).toEqual([
      { quizId: made.id, title: 'Вікторина: Родина Квіткових', mine: false, at: later(30).toISOString() },
    ]);
    expect(forOlia.find((item) => item.id === fact.id)?.uses).toEqual([]);
    const forPetro = await listItems(db, id, petro, 'member');
    expect(forPetro.find((item) => item.id === surprise.id)?.uses).toMatchObject([{ mine: true }]);
  });
});
