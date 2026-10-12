import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { makeQuiz, single } from '@quiz/engine/testing';
import { createTestDb } from '../testing/test-db';
import { quiz, user } from './schema';

describe('database schema', () => {
  it('stores a quiz with its questions and settings and returns them unchanged', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const source = makeQuiz([single]);

    const [created] = await db
      .insert(quiz)
      .values({ ownerId: 'u1', title: source.title, description: '', settings: source.settings, questions: source.questions })
      .returning();

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    const [loaded] = await db.select().from(quiz).where(eq(quiz.id, created.id));
    expect(loaded.questions).toEqual(source.questions);
    expect(loaded.settings).toEqual(source.settings);
  });

  it('removes a user’s quizzes together with the user', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'olena@example.com' });
    const source = makeQuiz([single]);
    await db.insert(quiz).values({ ownerId: 'u1', title: 'T', description: '', settings: source.settings, questions: source.questions });

    await db.delete(user).where(eq(user.id, 'u1'));
    expect(await db.select().from(quiz)).toEqual([]);
  });

  it('refuses two users with the same email', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Олена', email: 'same@example.com' });
    await expect(db.insert(user).values({ id: 'u2', name: 'Тарас', email: 'same@example.com' })).rejects.toThrow();
  });
});
