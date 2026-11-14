import type { GroupItemInput } from '@quiz/shared';
import { makeQuiz, single } from '@quiz/engine/testing';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db/client';
import { familyGroup, quiz, user } from './db/schema';
import { createItem } from './group-items';
import { createGroup, joinByCode } from './group-store';
import { markUses, usesOf } from './group-uses';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

let db: Db;
let n = 0;
const T = new Date('2026-11-14T10:00:00.000Z');
const later = (minutes: number) => new Date(T.getTime() + minutes * 60_000);
const MISSING = '99999999-9999-4999-8999-999999999999';

beforeAll(async () => {
  db = await createTestDb();
});

async function person(name: string) {
  n += 1;
  const id = `gu${n}`;
  await db.insert(user).values({ id, name, email: `${id}@example.com` });
  await ensureProfile(db, id);
  return id;
}

const base: GroupItemInput = { kind: 'fact', text: '', about: [], answer: null, year: null, photo: null, surprise: false };

async function write(groupId: string, authorId: string, input: Partial<GroupItemInput>) {
  const created = await createItem(db, groupId, authorId, { ...base, ...input }, later(5));
  if (!created.ok) throw new Error(created.error);
  return created.item;
}

async function quizOf(ownerId: string, title: string) {
  const source = makeQuiz([single]);
  const [row] = await db
    .insert(quiz)
    .values({ ownerId, title, description: '', settings: source.settings, rounds: source.rounds })
    .returning();
  return row.id;
}

/** «Родина Квіткових»: Оля — власниця, Петро — учасник; історія Олі й сюрприз Петра про Олю. */
async function family() {
  const olia = await person('Оля');
  const petro = await person('Петро');
  const created = await createGroup(db, olia, { name: 'Родина Квіткових', emoji: '🌻', description: '' }, T);
  if (!created.ok) throw new Error(created.error);
  const id = created.id;
  const [row] = await db.select({ code: familyGroup.inviteCode }).from(familyGroup).where(eq(familyGroup.id, id));
  await joinByCode(db, row.code, petro, later(1));
  const story = await write(id, olia, { kind: 'story', text: 'Як тато заблукав у лісі по гриби', about: [{ kind: 'name', name: 'тато' }], answer: 'Тато', year: 1998 });
  const surprise = await write(id, petro, {
    text: 'Оля колись спекла торт без борошна',
    about: [{ kind: 'member', userId: olia }],
    surprise: true,
  });
  return { id, olia, petro, story, surprise };
}

describe('group record uses (12l)', () => {
  it('marks a record used in my quiz once; everyone who sees the record sees the quiz', async () => {
    const { id, olia, petro, story } = await family();
    const quizId = await quizOf(olia, 'Вікторина: Родина Квіткових');
    expect(await markUses(db, id, olia, { quizId, itemIds: [story.id] }, later(10))).toEqual({ ok: true, marked: 1 });
    expect(await markUses(db, id, olia, { quizId, itemIds: [story.id] }, later(11))).toEqual({ ok: true, marked: 0 });
    expect((await usesOf(db, [story.id], olia)).get(story.id)).toEqual([
      { quizId, title: 'Вікторина: Родина Квіткових', mine: true, at: later(10).toISOString() },
    ]);
    expect((await usesOf(db, [story.id], petro)).get(story.id)).toEqual([
      { quizId, title: 'Вікторина: Родина Квіткових', mine: false, at: later(10).toISOString() },
    ]);
  });

  it('silently drops a surprise about me and a record of another group', async () => {
    const { id, olia, surprise } = await family();
    const other = await family();
    const quizId = await quizOf(olia, 'Вікторина: Родина Квіткових');
    expect(await markUses(db, id, olia, { quizId, itemIds: [surprise.id] }, later(10))).toEqual({ ok: true, marked: 0 });
    expect(await markUses(db, id, olia, { quizId, itemIds: [other.story.id] }, later(10))).toEqual({ ok: true, marked: 0 });
    expect((await usesOf(db, [surprise.id, other.story.id], olia)).size).toBe(0);
  });

  it('only for my own quiz', async () => {
    const { id, olia, petro, story } = await family();
    const quizId = await quizOf(olia, 'Вікторина: Родина Квіткових');
    expect(await markUses(db, id, petro, { quizId, itemIds: [story.id] }, later(10))).toEqual({ ok: false, error: 'quiz_not_found' });
    expect(await markUses(db, id, olia, { quizId: MISSING, itemIds: [story.id] }, later(10))).toEqual({ ok: false, error: 'quiz_not_found' });
  });

  it('shows the current quiz title, oldest first; a removed quiz takes its mark', async () => {
    const { id, olia, petro, story } = await family();
    const first = await quizOf(olia, 'Родинна розминка');
    const second = await quizOf(petro, 'Свята в бабусі');
    await markUses(db, id, petro, { quizId: second, itemIds: [story.id] }, later(20));
    await markUses(db, id, olia, { quizId: first, itemIds: [story.id] }, later(10));
    await db.update(quiz).set({ title: 'Родинна розминка 2' }).where(eq(quiz.id, first));
    expect((await usesOf(db, [story.id], olia)).get(story.id)?.map((use) => [use.title, use.mine])).toEqual([
      ['Родинна розминка 2', true],
      ['Свята в бабусі', false],
    ]);
    await db.delete(quiz).where(eq(quiz.id, first));
    expect((await usesOf(db, [story.id], olia)).get(story.id)?.map((use) => use.title)).toEqual(['Свята в бабусі']);
    expect((await usesOf(db, [], olia)).size).toBe(0);
  });
});
