import { quizSchema, type Quiz } from '@quiz/shared';
import { blitzRound, bool, classicRound, makeRoundsQuiz, multi, numeric, order, single, text } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { game, libraryCopy, libraryEntry, profile, quiz, user, userBan, userLike } from './db/schema';
import { appealEntry, catalog, closeEntry, copyEntry, entryDetail, escapeLike, myEntries, openEntry, visibleEntry } from './library-store';
import { ensureProfile } from './profiles';
import { createQuiz, getQuiz, updateQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

const T0 = new Date('2026-11-18T10:00:00Z');
const T1 = new Date('2026-11-18T11:00:00Z');
const T2 = new Date('2026-11-18T12:00:00Z');
const IMG = `/uploads/${'a'.repeat(16)}.webp`;

/** Шість запитань про міста й річки України в двох раундах різних типів; перше — з картинкою. */
function riversQuiz(over: Partial<Pick<Quiz, 'title' | 'description'>> = {}, count = 6): Quiz {
  const questions = [{ ...single, imageUrl: IMG }, multi, bool, text, numeric, order].slice(0, count);
  const rounds = count > 4 ? [classicRound('r1', questions.slice(0, 4), { title: 'Міста' }), blitzRound('r2', questions.slice(4), { title: 'Річки' })] : [classicRound('r1', questions, { title: 'Міста' })];
  return { ...makeRoundsQuiz(rounds), title: 'Річки й міста', description: 'Про Дніпро й міста над ним', ...over };
}

async function setup() {
  const db = await createTestDb();
  const people = { olena: 'u-olena', taras: 'u-taras', iryna: 'u-iryna' } as const;
  await db.insert(user).values([
    { id: people.olena, name: 'Олена', email: 'olena@example.com' },
    { id: people.taras, name: 'Тарас', email: 'taras@example.com' },
    { id: people.iryna, name: 'Ірина', email: 'iryna@example.com' },
  ]);
  for (const id of Object.values(people)) await ensureProfile(db, id);
  return { db, ...people };
}

async function openNew(db: Db, ownerId: string, over: Partial<Pick<Quiz, 'title' | 'description'>> = {}, language: 'uk' | 'en' = 'uk', now = T0) {
  const quizId = await createQuiz(db, ownerId, riversQuiz(over));
  const result = await openEntry(db, ownerId, quizId, language, now);
  if (!result.ok) throw new Error(result.error);
  return { quizId, entryId: result.entryId };
}

const like = (userId: string, targetUserId: string, quizId: string, hidden = false) => ({ userId, kind: 'quiz' as const, targetUserId, quizId, hidden, createdAt: T0 });

describe('library store (38g)', () => {
  it('the fixture is a valid quiz', () => {
    expect(quizSchema.safeParse(riversQuiz()).success).toBe(true);
  });

  it('opens a snapshot and keeps it until update', async () => {
    const { db, olena } = await setup();
    const { quizId, entryId } = await openNew(db, olena);
    let page = await catalog(db, { sort: 'popular', offset: 0 }, null);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: entryId, title: 'Річки й міста', questionCount: 6, roundTypes: ['classic', 'blitz'], language: 'uk', likes: 0, plays: 0 });

    await updateQuiz(db, olena, quizId, riversQuiz({ title: 'Нова назва' }));
    page = await catalog(db, { sort: 'popular', offset: 0 }, null);
    expect(page.items[0]!.title).toBe('Річки й міста');

    const again = await openEntry(db, olena, quizId, 'en', T1);
    expect(again).toEqual({ ok: true, entryId });
    page = await catalog(db, { sort: 'popular', offset: 0 }, null);
    expect(page.items[0]).toMatchObject({ title: 'Нова назва', language: 'en' });
    const [row] = await db.select().from(libraryEntry);
    expect(row!.openedAt).toEqual(T0);
    expect(row!.updatedAt).toEqual(T1);
  });

  it('refuses too few, broken and foreign quizzes', async () => {
    const { db, olena, taras } = await setup();
    const few = await createQuiz(db, olena, riversQuiz({}, 4));
    expect(await openEntry(db, olena, few, 'uk', T0)).toEqual({ ok: false, error: 'library_too_few' });
    const [broken] = await db
      .insert(quiz)
      .values({ ownerId: olena, title: 'Зламана', description: '', settings: riversQuiz().settings, rounds: [] })
      .returning({ id: quiz.id });
    expect(await openEntry(db, olena, broken!.id, 'uk', T0)).toEqual({ ok: false, error: 'library_invalid' });
    const good = await createQuiz(db, olena, riversQuiz());
    expect(await openEntry(db, taras, good, 'uk', T0)).toEqual({ ok: false, error: 'not_found' });
    expect(await openEntry(db, olena, 'not-a-uuid', 'uk', T0)).toEqual({ ok: false, error: 'not_found' });
    expect(await db.select().from(libraryEntry)).toEqual([]);
  });

  it('closing hides from the catalog and keeps the moderation', async () => {
    const { db, olena, taras } = await setup();
    const { quizId } = await openNew(db, olena);
    expect(await closeEntry(db, taras, quizId)).toBe(false);
    expect(await closeEntry(db, olena, quizId)).toBe(true);
    expect((await catalog(db, { sort: 'new', offset: 0 }, null)).items).toEqual([]);
    expect((await myEntries(db, olena))[0]).toMatchObject({ quizId, listed: false, moderation: 'ok' });

    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.quizId, quizId));
    expect(await openEntry(db, olena, quizId, 'uk', T1)).toEqual({ ok: false, error: 'library_hidden' });
    const [row] = await db.select().from(libraryEntry);
    expect(row).toMatchObject({ listed: false, moderation: 'hidden' });
  });

  it('catalog shows only visible entries without answers', async () => {
    const { db, olena, taras, iryna } = await setup();
    const shown = await openNew(db, olena, { title: 'Видима' });
    const closed = await openNew(db, olena, { title: 'Закрита' });
    await closeEntry(db, olena, closed.quizId);
    const auto = await openNew(db, olena, { title: 'Авто' });
    await db.update(libraryEntry).set({ moderation: 'auto_hidden' }).where(eq(libraryEntry.id, auto.entryId));
    const hidden = await openNew(db, olena, { title: 'Прихована' });
    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.id, hidden.entryId));
    const banned = await openNew(db, taras, { title: 'Заблокованого' });
    await db.insert(userBan).values({ userId: taras, bannedAt: T0 });
    const nameless = await openNew(db, iryna, { title: 'Без ніка' });
    await db.update(profile).set({ nickname: null, nicknameKey: null }).where(eq(profile.userId, iryna));

    const page = await catalog(db, { sort: 'new', offset: 0 }, null);
    expect(page.items.map((card) => card.title).sort()).toEqual(['Без ніка', 'Видима']);
    expect(page.items.find((card) => card.id === shown.entryId)!.author).toBe('Олена');
    expect(page.items.find((card) => card.id === nameless.entryId)!.author).toBe('');
    const json = JSON.stringify(page);
    for (const secret of [single.text, multi.text, 'Одеса', IMG, olena, iryna, shown.quizId, nameless.quizId, 'olena@example.com']) expect(json).not.toContain(secret);
    expect(Object.keys(page.items[0]!).sort()).toEqual(['author', 'description', 'id', 'language', 'likes', 'plays', 'questionCount', 'roundTypes', 'title']);

    for (const entry of [closed, auto, hidden, banned]) {
      expect(await visibleEntry(db, entry.entryId)).toBeNull();
      expect(await entryDetail(db, entry.entryId, null)).toBeNull();
    }
    expect(await visibleEntry(db, shown.entryId)).toEqual({ id: shown.entryId, quizId: shown.quizId, ownerId: olena, title: 'Видима' });
  });

  it('search, language and order', async () => {
    const { db, olena, taras, iryna } = await setup();
    const a = await openNew(db, olena, { title: 'Перша', description: 'Мости через ДНІПРО й річки' }, 'uk', T0);
    const b = await openNew(db, olena, { title: 'Друга 100% річок', description: '' }, 'uk', T1);
    const c = await openNew(db, olena, { title: 'Third', description: 'Rivers' }, 'en', T2);

    const search = async (q: string) => (await catalog(db, { q, sort: 'new', offset: 0 }, null)).items.map((card) => card.id);
    expect(await search('дніп')).toEqual([a.entryId]);
    expect(await search('% р')).toEqual([b.entryId]);
    expect(await search('%')).toEqual([c.entryId, b.entryId, a.entryId]); // коротше двох символів — без фільтра
    expect(await search('_ч')).toEqual([]); // _ — літера, не будь-який символ
    expect((await catalog(db, { sort: 'new', lang: 'en', offset: 0 }, null)).items.map((card) => card.id)).toEqual([c.entryId]);

    // popular: ❤️ ↓ (приховані не рахуються), рівні — новіші першими.
    await db.insert(userLike).values([like(taras, olena, a.quizId), like(iryna, olena, a.quizId), like(taras, olena, b.quizId), like(iryna, olena, c.quizId, true)]);
    const popular = await catalog(db, { sort: 'popular', offset: 0 }, null);
    expect(popular.items.map((card) => [card.id, card.likes])).toEqual([
      [a.entryId, 2],
      [b.entryId, 1],
      [c.entryId, 0],
    ]);
    expect((await catalog(db, { sort: 'new', offset: 0 }, null)).items.map((card) => card.id)).toEqual([c.entryId, b.entryId, a.entryId]);
  });

  it('pages by twenty', async () => {
    const { db, olena } = await setup();
    for (let i = 0; i < 21; i++) await openNew(db, olena, { title: `Вікторина ${i}` }, 'uk', new Date(T0.getTime() + i * 1000));
    const first = await catalog(db, { sort: 'new', offset: 0 }, null);
    expect(first.items).toHaveLength(20);
    expect(first.next).toBe(20);
    expect(first.items[0]!.title).toBe('Вікторина 20');
    const second = await catalog(db, { sort: 'new', offset: 20 }, null);
    expect(second.items.map((card) => card.title)).toEqual(['Вікторина 0']);
    expect(second.next).toBeNull();
  });

  it('liked and mine for the viewer', async () => {
    const { db, olena, taras } = await setup();
    const { quizId, entryId } = await openNew(db, olena);
    await db.insert(userLike).values(like(taras, olena, quizId));
    const byTaras = await catalog(db, { sort: 'popular', offset: 0 }, taras);
    expect(byTaras.items[0]).toMatchObject({ liked: true, likes: 1 });
    expect(byTaras.items[0]).not.toHaveProperty('mine');
    const guest = await catalog(db, { sort: 'popular', offset: 0 }, null);
    expect(guest.items[0]).not.toHaveProperty('liked');
    const own = await catalog(db, { sort: 'popular', offset: 0 }, olena);
    expect(own.items[0]).toMatchObject({ liked: false, mine: true });
    expect(await entryDetail(db, entryId, taras)).toMatchObject({ liked: true });
    expect(await entryDetail(db, entryId, olena)).toMatchObject({ mine: true });
  });

  it('detail lists rounds by title and type only', async () => {
    const { db, olena } = await setup();
    const { quizId, entryId } = await openNew(db, olena);
    const detail = await entryDetail(db, entryId, null);
    expect(detail).toMatchObject({
      id: entryId,
      author: 'Олена',
      questionCount: 6,
      rounds: [
        { title: 'Міста', type: 'classic' },
        { title: 'Річки', type: 'blitz' },
      ],
      openedAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
    });
    expect(Object.keys(detail!.rounds[0]!).sort()).toEqual(['title', 'type']);
    const json = JSON.stringify(detail);
    for (const secret of [single.text, 'Одеса', IMG, olena, quizId]) expect(json).not.toContain(secret);
    expect(await entryDetail(db, 'not-a-uuid', null)).toBeNull();
    await closeEntry(db, olena, quizId);
    expect(await entryDetail(db, entryId, null)).toBeNull();
  });

  it('copy carries all content and the author line', async () => {
    const { db, olena, taras } = await setup();
    const long = 'д'.repeat(500);
    const { entryId, quizId } = await openNew(db, olena, { description: long });
    const result = await copyEntry(db, taras, entryId, 'uk', T1);
    if (!result.ok) throw new Error(result.error);
    const copy = (await getQuiz(db, taras, result.quizId))!;
    const source = (await getQuiz(db, olena, quizId))!;
    expect(copy.rounds).toEqual(source.rounds);
    expect(JSON.stringify(copy)).toContain(IMG);
    expect(copy.description.startsWith('Автор: Олена\nддд')).toBe(true);
    expect(copy.description).toHaveLength(500);
    expect(quizSchema.safeParse(copy).success).toBe(true);
    const [row] = await db.select().from(libraryCopy);
    expect(row).toMatchObject({ entryId, userId: taras, quizId: result.quizId, authorLine: 'Автор: Олена', at: T1 });

    const en = await copyEntry(db, taras, entryId, 'en', T1);
    if (!en.ok) throw new Error(en.error);
    expect((await getQuiz(db, taras, en.quizId))!.description.startsWith('Author: Олена\n')).toBe(true);

    expect(await copyEntry(db, olena, entryId, 'uk', T1)).toEqual({ ok: false, error: 'library_own' });
    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.id, entryId));
    expect(await copyEntry(db, taras, entryId, 'uk', T1)).toEqual({ ok: false, error: 'not_found' });
  });

  it('a nameless author gets the default nickname in the copy', async () => {
    const { db, olena, taras } = await setup();
    const { entryId } = await openNew(db, olena, { description: '' });
    await db.update(profile).set({ nickname: null, nicknameKey: null }).where(eq(profile.userId, olena));
    const result = await copyEntry(db, taras, entryId, 'uk', T1);
    if (!result.ok) throw new Error(result.error);
    expect((await getQuiz(db, taras, result.quizId))!.description).toBe('Автор: Гравець');
  });

  it('the author line stays when a copy is opened', async () => {
    const { db, olena, taras, iryna } = await setup();
    const { entryId } = await openNew(db, olena);
    const copied = await copyEntry(db, taras, entryId, 'uk', T1);
    if (!copied.ok) throw new Error(copied.error);

    // Тарас стирає рядок автора з опису копії й відкриває її.
    const own = (await getQuiz(db, taras, copied.quizId))!;
    await updateQuiz(db, taras, copied.quizId, { ...own, description: 'Мій опис' });
    const opened = await openEntry(db, taras, copied.quizId, 'uk', T2);
    if (!opened.ok) throw new Error(opened.error);
    const [entry] = await db.select().from(libraryEntry).where(eq(libraryEntry.id, opened.entryId));
    expect(entry!.originLine).toBe('Автор: Олена');
    expect(entry!.description).toBe('Автор: Олена\nМій опис');
    expect((entry!.snapshot as Quiz).description).toBe('Автор: Олена\nМій опис');
    // Сама вікторина Тараса не змінюється.
    expect((await getQuiz(db, taras, copied.quizId))!.description).toBe('Мій опис');

    const again = await copyEntry(db, iryna, opened.entryId, 'uk', T2);
    if (!again.ok) throw new Error(again.error);
    const third = (await getQuiz(db, iryna, again.quizId))!;
    expect(third.description).toBe('Автор: Олена\nМій опис');
    const [line] = await db.select().from(libraryCopy).where(eq(libraryCopy.quizId, again.quizId));
    expect(line!.authorLine).toBe('Автор: Олена');
  });

  it('a kept author line is not added twice', async () => {
    const { db, olena, taras } = await setup();
    const { entryId } = await openNew(db, olena);
    const copied = await copyEntry(db, taras, entryId, 'uk', T1);
    if (!copied.ok) throw new Error(copied.error);
    const opened = await openEntry(db, taras, copied.quizId, 'uk', T2);
    if (!opened.ok) throw new Error(opened.error);
    const [entry] = await db.select().from(libraryEntry).where(eq(libraryEntry.id, opened.entryId));
    expect(entry!.description).toBe('Автор: Олена\nПро Дніпро й міста над ним');
  });

  it('plays count finished games of copies', async () => {
    const { db, olena, taras } = await setup();
    const { entryId, quizId } = await openNew(db, olena);
    const copied = await copyEntry(db, taras, entryId, 'uk', T1);
    if (!copied.ok) throw new Error(copied.error);
    const snapshot = riversQuiz();
    const played = (id: string, quiz: string, status: 'finished' | 'aborted', hostId: string = taras) => ({ id, quizId: quiz, hostId, code: 'ABCD', status, title: 'Q', quizSnapshot: snapshot, startedAt: T1 });
    await db.insert(game).values([
      played('11111111-1111-4111-8111-111111111111', copied.quizId, 'finished'),
      played('22222222-2222-4222-8222-222222222222', copied.quizId, 'finished'),
      played('33333333-3333-4333-8333-333333333333', copied.quizId, 'aborted'),
      played('44444444-4444-4444-8444-444444444444', quizId, 'finished', olena),
    ]);
    expect((await catalog(db, { sort: 'popular', offset: 0 }, null)).items[0]!.plays).toBe(2);
    expect((await entryDetail(db, entryId, null))!.plays).toBe(2);
    expect((await myEntries(db, olena))[0]!.plays).toBe(2);
  });

  it('appeal once', async () => {
    const { db, olena, taras } = await setup();
    const { quizId } = await openNew(db, olena);
    expect(await appealEntry(db, olena, quizId, T1)).toBe('library_not_hidden');
    expect(await appealEntry(db, taras, quizId, T1)).toBe('not_found');
    await db.update(libraryEntry).set({ moderation: 'hidden' }).where(eq(libraryEntry.quizId, quizId));
    expect(await appealEntry(db, olena, quizId, T1)).toBe('ok');
    expect((await myEntries(db, olena))[0]).toMatchObject({ moderation: 'hidden', appealed: true, appealOpen: true });
    expect(await appealEntry(db, olena, quizId, T2)).toBe('library_appeal_used');
    const [row] = await db.select().from(libraryEntry);
    expect(row!.appealedAt).toEqual(T1);
  });

  it('my entries carry likes and the state', async () => {
    const { db, olena, taras } = await setup();
    const { quizId, entryId } = await openNew(db, olena, {}, 'en');
    await db.insert(userLike).values(like(taras, olena, quizId));
    expect(await myEntries(db, olena)).toEqual([
      { quizId, entryId, listed: true, moderation: 'ok', appealed: false, appealOpen: false, language: 'en', updatedAt: T0.toISOString(), likes: 1, plays: 0 },
    ]);
    expect(await myEntries(db, taras)).toEqual([]);
  });

  it('escapeLike escapes and skips short queries', () => {
    expect(escapeLike(undefined, 100)).toBeNull();
    expect(escapeLike(' a ', 100)).toBeNull();
    expect(escapeLike('50%_\\', 100)).toBe('%50\\%\\_\\\\%');
    expect(escapeLike('абвгд', 3)).toBe('%абв%');
  });
});
