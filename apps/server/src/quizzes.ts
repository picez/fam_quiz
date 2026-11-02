import { questionsOf, quizSchema, type Duels, type Question, type Quiz, type QuizSettings } from '@quiz/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz } from './db/schema';
import { syncHiddenLikes } from './like-store';

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

/**
 * Дуелі й запасні запитання зберігаються в тому ж jsonb, що й налаштування: окремої колонки немає, міграції теж.
 * Старі рядки цих полів не мають.
 */
const storedSettings = (data: Quiz): QuizSettings & { duels?: Duels; spares?: Question[] } => ({
  ...data.settings,
  ...(data.duels === undefined ? {} : { duels: data.duels }),
  ...(data.spares === undefined ? {} : { spares: data.spares }),
});

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

type QuizRow = typeof quiz.$inferSelect;

function quizOf(row: QuizRow): Quiz {
  const { duels, spares, ...settings } = row.settings;
  const stored = { title: row.title, description: row.description, settings, rounds: row.rounds, ...(duels === undefined ? {} : { duels }), ...(spares === undefined ? {} : { spares }) };
  // Схема дописує типові значення в старих вікторинах; зламаний рядок лишається як є.
  const parsed = quizSchema.safeParse(stored);
  return parsed.success ? parsed.data : stored;
}

export async function getQuiz(db: Db, ownerId: string, id: string): Promise<Quiz | null> {
  const where = owned(ownerId, id);
  if (where === null) return null;
  const [row] = await db.select().from(quiz).where(where);
  return row === undefined ? null : quizOf(row);
}

export async function createQuiz(db: Db, ownerId: string, data: Quiz): Promise<string> {
  const [row] = await db
    .insert(quiz)
    .values({ ownerId, title: data.title, description: data.description, settings: storedSettings(data), rounds: data.rounds })
    .returning({ id: quiz.id });
  return row.id;
}

/** Разом з вікториною — видимість лайків її запитань (видалене запитання ховається, повернене тим самим id знову видно). */
export async function updateQuiz(db: Db, ownerId: string, id: string, data: Quiz): Promise<boolean> {
  const where = owned(ownerId, id);
  if (where === null) return false;
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(quiz)
      .set({ title: data.title, description: data.description, settings: storedSettings(data), rounds: data.rounds, updatedAt: new Date() })
      .where(where)
      .returning({ id: quiz.id });
    if (rows.length === 0) return false;
    await syncHiddenLikes(tx, id, data);
    return true;
  });
}

/** Лайки запитань і вікторини лишаються в базі, але приховані. */
export async function deleteQuiz(db: Db, ownerId: string, id: string): Promise<boolean> {
  const where = owned(ownerId, id);
  if (where === null) return false;
  return db.transaction(async (tx) => {
    const rows = await tx.delete(quiz).where(where).returning({ id: quiz.id });
    if (rows.length === 0) return false;
    await syncHiddenLikes(tx, id, null);
    return true;
  });
}
