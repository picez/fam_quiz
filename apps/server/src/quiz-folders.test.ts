import { makeQuiz, single } from '@quiz/engine/testing';
import { QUIZ_FOLDER_LIMITS } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { quiz, quizFolder, user } from './db/schema';
import { createFolder, deleteFolder, listFolders, moveQuiz, renameFolder, reorderFolders } from './quiz-folders';
import { createQuiz } from './quizzes';
import { createTestDb } from './testing/test-db';

const T0 = new Date('2026-11-22T10:00:00.000Z');
const T1 = new Date('2026-11-22T11:00:00.000Z');
const UNKNOWN = '11111111-1111-4111-8111-111111111111';

let db: Db;
let n = 0;

beforeAll(async () => {
  db = await createTestDb();
});

/** Олена й Петро — кожна пара людей своя, щоб тести не бачили чужих категорій. */
async function people(): Promise<{ olena: string; petro: string }> {
  n += 1;
  const olena = `qf-olena-${n}`;
  const petro = `qf-petro-${n}`;
  await db.insert(user).values([
    { id: olena, name: 'Олена', email: `${olena}@example.com` },
    { id: petro, name: 'Петро', email: `${petro}@example.com` },
  ]);
  return { olena, petro };
}

async function made(ownerId: string, name: string, now = T0) {
  const result = await createFolder(db, ownerId, name, now);
  if (!result.ok) throw new Error(result.error);
  return result.folder;
}

async function quizOf(ownerId: string, folderId: string | null = null): Promise<string> {
  const id = await createQuiz(db, ownerId, makeQuiz([single]));
  await db.update(quiz).set({ folderId, updatedAt: T0 }).where(eq(quiz.id, id));
  return id;
}

const rowOf = async (id: string) => (await db.select().from(quiz).where(eq(quiz.id, id)))[0]!;
const positions = async (ownerId: string) => (await listFolders(db, ownerId)).map((f) => [f.name, f.position]);

describe('createFolder (73)', () => {
  it('appends at the end; the same name in another case is taken; another person may use it', async () => {
    const { olena, petro } = await people();
    const films = await made(olena, 'Кіно');
    expect(films).toEqual({ id: expect.any(String), name: 'Кіно', position: 0, createdAt: T0.toISOString() });
    expect((await made(olena, 'Для Асі')).position).toBe(1);
    expect(await createFolder(db, olena, 'кІНО', T0)).toEqual({ ok: false, error: 'folder_name_taken' });
    expect((await made(petro, 'Кіно')).position).toBe(0);
  });

  it('the 31st folder is refused', async () => {
    const { olena } = await people();
    for (let i = 0; i < QUIZ_FOLDER_LIMITS.perOwner; i += 1) await made(olena, `Папка ${i}`);
    expect(await createFolder(db, olena, 'Ще одна', T0)).toEqual({ ok: false, error: 'folders_full' });
    expect(await listFolders(db, olena)).toHaveLength(QUIZ_FOLDER_LIMITS.perOwner);
  });

  it('two at once with the same name: one wins, the other is told the name is taken', async () => {
    const { olena } = await people();
    const results = await Promise.all([createFolder(db, olena, 'Кіно', T0), createFolder(db, olena, 'кіно', T0)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'folder_name_taken' }]);
    expect(await listFolders(db, olena)).toHaveLength(1);
  });
});

describe('renameFolder (73)', () => {
  it('renames its own; a name of another own folder is taken; a case change is fine; a foreign one is not found', async () => {
    const { olena, petro } = await people();
    const films = await made(olena, 'Кіно');
    await made(olena, 'Для Асі');
    const result = await renameFolder(db, olena, films.id, 'Фільми', T1);
    expect(result).toEqual({ ok: true, folder: { ...films, name: 'Фільми' } });
    expect((await db.select().from(quizFolder).where(eq(quizFolder.id, films.id)))[0]?.updatedAt).toEqual(T1);
    expect(await renameFolder(db, olena, films.id, 'для асі', T1)).toEqual({ ok: false, error: 'folder_name_taken' });
    expect(await renameFolder(db, olena, films.id, 'фільми', T1)).toMatchObject({ ok: true, folder: { name: 'фільми' } });
    expect(await renameFolder(db, petro, films.id, 'Моє', T1)).toEqual({ ok: false, error: 'not_found' });
    expect(await renameFolder(db, olena, UNKNOWN, 'Моє', T1)).toEqual({ ok: false, error: 'not_found' });
    expect(await renameFolder(db, olena, 'not-a-uuid', 'Моє', T1)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('reorderFolders (73)', () => {
  it('takes exactly the full set; anything else changes nothing', async () => {
    const { olena, petro } = await people();
    const a = await made(olena, 'А');
    const b = await made(olena, 'Б');
    const c = await made(olena, 'В');
    const foreign = await made(petro, 'Чуже');

    const result = await reorderFolders(db, olena, [c.id, a.id, b.id], T1);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.folders.map((f) => [f.name, f.position])).toEqual([['В', 0], ['А', 1], ['Б', 2]]);

    const before = await positions(olena);
    for (const ids of [[a.id, b.id], [c.id, a.id, b.id, foreign.id], [c.id, a.id, UNKNOWN], [c.id, a.id, foreign.id]]) {
      expect(await reorderFolders(db, olena, ids, T1)).toEqual({ ok: false, error: 'folders_changed' });
    }
    expect(await positions(olena)).toEqual(before);
    expect(await positions(petro)).toEqual([['Чуже', 0]]);
  });
});

describe('deleteFolder (73)', () => {
  it('its quizzes stay without a folder and keep updated_at; the rest close the gap; a foreign one is not found', async () => {
    const { olena, petro } = await people();
    await made(olena, 'А');
    const b = await made(olena, 'Б');
    await made(olena, 'В');
    const inB = await quizOf(olena, b.id);

    expect(await deleteFolder(db, petro, b.id)).toBe(false);
    expect(await deleteFolder(db, olena, 'not-a-uuid')).toBe(false);
    expect(await deleteFolder(db, olena, b.id)).toBe(true);

    expect(await rowOf(inB)).toMatchObject({ folderId: null, updatedAt: T0 });
    expect(await positions(olena)).toEqual([['А', 0], ['В', 1]]);
    expect(await deleteFolder(db, olena, b.id)).toBe(false);
  });
});

describe('moveQuiz (73)', () => {
  it('own quiz into own folder or none; foreign quiz or folder is not found; updated_at stays', async () => {
    const { olena, petro } = await people();
    const films = await made(olena, 'Кіно');
    const theirs = await made(petro, 'Петрове');
    const mine = await quizOf(olena);
    const petroQuiz = await quizOf(petro);

    expect(await moveQuiz(db, olena, mine, films.id)).toBe(true);
    expect(await rowOf(mine)).toMatchObject({ folderId: films.id, updatedAt: T0 });
    expect(await moveQuiz(db, olena, mine, null)).toBe(true);
    expect(await rowOf(mine)).toMatchObject({ folderId: null, updatedAt: T0 });

    expect(await moveQuiz(db, olena, mine, theirs.id)).toBe(false);
    expect(await moveQuiz(db, olena, mine, UNKNOWN)).toBe(false);
    expect(await moveQuiz(db, olena, petroQuiz, films.id)).toBe(false);
    expect(await moveQuiz(db, olena, petroQuiz, null)).toBe(false);
    expect(await moveQuiz(db, olena, 'not-a-uuid', null)).toBe(false);
    expect(await moveQuiz(db, olena, mine, 'not-a-uuid')).toBe(false);
    expect(await rowOf(mine)).toMatchObject({ folderId: null });
    expect(await rowOf(petroQuiz)).toMatchObject({ folderId: null });
  });
});

describe('listFolders (73)', () => {
  it('only own folders, by position then created_at', async () => {
    const { olena, petro } = await people();
    const later = await made(olena, 'Пізніша', T1);
    const earlier = await made(olena, 'Рання', T0);
    await made(petro, 'Петрова');
    // Однакова позиція (як після давнього збою) — раніша першою.
    await db.update(quizFolder).set({ position: 0 }).where(eq(quizFolder.ownerId, olena));
    expect((await listFolders(db, olena)).map((f) => f.id)).toEqual([earlier.id, later.id]);
  });
});
