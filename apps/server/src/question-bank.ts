import { QUESTION_BANK_PAGE_SIZE, matchesBankQuery, pageCount, pageOffset, roundQuestions, type QuestionBankItem, type QuestionBankPage, type QuestionBankQuery } from '@quiz/shared';
import { desc, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz } from './db/schema';
import { quizOf } from './quizzes';

/**
 * Банк запитань (38f): пошук по вікторинах того, хто питає, і ніяких інших. Беруться запитання раундів (разом із клітинками поля);
 * запасні, дуелі й питання на виживання — ні: у них немає «раунду» і вони живуть за іншими правилами.
 *
 * Копії запитань посилаються на ті самі адреси завантажених файлів. Завантаження ніколи не видаляються
 * (єдиний `remove` — резервні копії `backups/db/`), тому копії безпечні; якщо колись з'явиться прибирання,
 * воно мусить шукати посилання в усіх вікторинах (`questionsOf` + `spares` + `duels`).
 */
export async function searchQuestionBank(db: Db, ownerId: string, query: QuestionBankQuery): Promise<QuestionBankPage> {
  const rows = await db
    .select({ id: quiz.id, title: quiz.title, description: quiz.description, settings: quiz.settings, rounds: quiz.rounds, updatedAt: quiz.updatedAt })
    .from(quiz)
    .where(eq(quiz.ownerId, ownerId))
    .orderBy(desc(quiz.updatedAt), desc(quiz.id));
  const types = new Set<string>(query.types);
  const found: QuestionBankItem[] = [];
  for (const row of rows) {
    const data = quizOf(row);
    data.rounds.forEach((round, roundIndex) => {
      for (const question of roundQuestions(round)) {
        if (types.has(question.type) && matchesBankQuery(question, query.q)) found.push({ quizId: row.id, quizTitle: row.title, roundIndex, roundTitle: round.title, question });
      }
    });
  }
  const start = pageOffset(query.page, QUESTION_BANK_PAGE_SIZE);
  return { items: found.slice(start, start + QUESTION_BANK_PAGE_SIZE), page: query.page, pages: pageCount(found.length, QUESTION_BANK_PAGE_SIZE), total: found.length };
}
