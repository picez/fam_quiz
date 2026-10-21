import { questionsOf, quizSchema, type Quiz } from '@quiz/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz } from './db/schema';

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Умова «ця вікторина цього власника»; null, якщо id не може бути ідентифікатором. */
const owned = (ownerId: string, id: string) => (UUID.test(id) ? and(eq(quiz.id, id), eq(quiz.ownerId, ownerId)) : null);

export async function listQuizzes(db: Db, ownerId: string): Promise<QuizSummary[]> {
  const rows = await db.select().from(quiz).where(eq(quiz.ownerId, ownerId)).orderBy(desc(quiz.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    questionCount: questionsOf(row).length,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getQuiz(db: Db, ownerId: string, id: string): Promise<Quiz | null> {
  const where = owned(ownerId, id);
  if (where === null) return null;
  const [row] = await db.select().from(quiz).where(where);
  if (row === undefined) return null;
  const stored = { title: row.title, description: row.description, settings: row.settings, rounds: row.rounds };
  // Схема дописує типові значення в старих вікторинах; зламаний рядок лишається як є.
  const parsed = quizSchema.safeParse(stored);
  return parsed.success ? parsed.data : stored;
}

export async function createQuiz(db: Db, ownerId: string, data: Quiz): Promise<string> {
  const [row] = await db
    .insert(quiz)
    .values({ ownerId, title: data.title, description: data.description, settings: data.settings, rounds: data.rounds })
    .returning({ id: quiz.id });
  return row.id;
}

export async function updateQuiz(db: Db, ownerId: string, id: string, data: Quiz): Promise<boolean> {
  const where = owned(ownerId, id);
  if (where === null) return false;
  const rows = await db
    .update(quiz)
    .set({ title: data.title, description: data.description, settings: data.settings, rounds: data.rounds, updatedAt: new Date() })
    .where(where)
    .returning({ id: quiz.id });
  return rows.length > 0;
}

export async function deleteQuiz(db: Db, ownerId: string, id: string): Promise<boolean> {
  const where = owned(ownerId, id);
  if (where === null) return false;
  const rows = await db.delete(quiz).where(where).returning({ id: quiz.id });
  return rows.length > 0;
}
