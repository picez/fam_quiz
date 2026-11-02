import { questionIdsOf, type LikeKind, type LikeTotals, type Quiz, type QuizLikes } from '@quiz/shared';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz, userLike } from './db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Одна зміна з кімнати (подія 'like'); targetUserId для host / player — з кімнати, для question / quiz його бере saveLike з quiz.owner_id. */
export interface LikeChange {
  userId: string;
  kind: LikeKind;
  liked: boolean;
  gameId: string;
  quizId: string | null;
  questionId?: string;
  targetUserId?: string;
}

/** Ключ лайка в пам'яті кімнати: 'quiz' | 'host' | `q:${questionId}` | `p:${targetUserId}`. */
export type LikeKey = string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ключ рядка в пам'яті кімнати. */
function keyOf(row: { kind: LikeKind; questionId: string | null; targetUserId: string }): LikeKey {
  if (row.kind === 'question') return `q:${row.questionId}`;
  if (row.kind === 'player') return `p:${row.targetUserId}`;
  return row.kind;
}

const FK_VIOLATION = '23503';

function isFkViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object'; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === FK_VIOLATION) return true;
  }
  return false;
}

/** Ключ рядка цієї зміни в базі. */
function keyWhere(change: LikeChange): SQL {
  const mine = and(eq(userLike.userId, change.userId), eq(userLike.kind, change.kind))!;
  if (change.kind === 'question') return and(mine, eq(userLike.quizId, change.quizId!), eq(userLike.questionId, change.questionId!))!;
  if (change.kind === 'quiz') return and(mine, eq(userLike.quizId, change.quizId!))!;
  if (change.kind === 'host') return and(mine, eq(userLike.gameId, change.gameId))!;
  return and(mine, eq(userLike.gameId, change.gameId), eq(userLike.targetUserId, change.targetUserId!))!;
}

/**
 * Рядок, який має бути (чи не бути) для цієї зміни; null — писати нічого (немає вікторини, себе чи своє).
 * Вікторину читає під FOR SHARE: паралельне збереження чи видалення вікторини чекає кінця транзакції лайка (і навпаки), тож hidden не застаріє.
 * Вікторину видалено, а liked = false — ключ без цілі: прихований рядок ще можна зняти.
 */
async function resolve(tx: Tx, change: LikeChange): Promise<{ targetUserId: string | null; hidden: boolean } | null> {
  if (change.kind === 'question' || change.kind === 'quiz') {
    if (change.quizId === null || !UUID.test(change.quizId)) return null;
    if (change.kind === 'question' && change.questionId === undefined) return null;
    const [found] = await tx
      .select({ ownerId: quiz.ownerId, rounds: quiz.rounds, settings: quiz.settings })
      .from(quiz)
      .where(eq(quiz.id, change.quizId))
      .for('share');
    if (found === undefined) return change.liked ? null : { targetUserId: null, hidden: true };
    if (found.ownerId === change.userId) return null;
    if (change.kind === 'quiz') return { targetUserId: found.ownerId, hidden: false };
    const ids = questionIdsOf({ rounds: found.rounds, spares: found.settings.spares });
    return { targetUserId: found.ownerId, hidden: !ids.has(change.questionId!) };
  }
  const target = change.targetUserId;
  if (target === undefined || target === change.userId) return null;
  return { targetUserId: target, hidden: false };
}

/**
 * liked → insert onConflictDoNothing (hidden для question — за questionIdsOf вікторини в базі); інакше delete за ключем виду.
 * Нічого не пише: gameId не uuid, user = target, вікторини немає (question/quiz, liked = true), акаунта цілі чи того, хто лайкає, уже немає (23503).
 */
export async function saveLike(db: Db, change: LikeChange): Promise<void> {
  if (!UUID.test(change.gameId)) return;
  try {
    await db.transaction(async (tx) => {
      const row = await resolve(tx, change);
      if (row === null) return;
      if (!change.liked) {
        await tx.delete(userLike).where(keyWhere(change));
        return;
      }
      await tx
        .insert(userLike)
        .values({
          userId: change.userId,
          kind: change.kind,
          targetUserId: row.targetUserId!,
          quizId: change.quizId,
          questionId: change.kind === 'question' ? change.questionId! : null,
          gameId: change.gameId,
          hidden: row.hidden,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    });
  } catch (error) {
    if (isFkViolation(error)) return;
    throw error;
  }
}

/** Власник вікторини (null — вікторини немає) і LikeKey кожного з userIds у цій грі: question/quiz за quizId (будь-яка гра), host/player за gameId. */
export async function roomLikes(
  db: Db,
  input: { quizId: string; gameId: string; userIds: string[] },
): Promise<{ author: string | null; mine: Map<string, Set<LikeKey>> }> {
  const mine = new Map<string, Set<LikeKey>>(input.userIds.map((id) => [id, new Set<LikeKey>()]));
  if (!UUID.test(input.quizId)) return { author: null, mine };
  const [owner] = await db.select({ ownerId: quiz.ownerId }).from(quiz).where(eq(quiz.id, input.quizId));
  const author = owner?.ownerId ?? null;
  if (author === null || input.userIds.length === 0) return { author, mine };
  const thisGame = UUID.test(input.gameId) ? and(inArray(userLike.kind, ['host', 'player']), eq(userLike.gameId, input.gameId)) : undefined;
  const rows = await db
    .select({ userId: userLike.userId, kind: userLike.kind, questionId: userLike.questionId, targetUserId: userLike.targetUserId })
    .from(userLike)
    .where(and(inArray(userLike.userId, input.userIds), or(and(inArray(userLike.kind, ['question', 'quiz']), eq(userLike.quizId, input.quizId)), thisGame)));
  for (const row of rows) mine.get(row.userId)?.add(keyOf(row));
  return { author, mine };
}

/** Лайки, які людина отримала як автор (question + quiz), ведучий і гравець; лише hidden = false. */
export async function likeTotals(db: Db, userId: string): Promise<LikeTotals> {
  const rows = await db
    .select({ kind: userLike.kind, n: sql<number>`count(*)::int` })
    .from(userLike)
    .where(and(eq(userLike.targetUserId, userId), eq(userLike.hidden, false)))
    .groupBy(userLike.kind);
  const of = (kind: LikeKind) => rows.find((r) => r.kind === kind)?.n ?? 0;
  return { author: of('question') + of('quiz'), host: of('host'), player: of('player') };
}

/** Лічильники редактора; null — вікторина не цього власника. */
export async function quizLikes(db: Db, ownerId: string, quizId: string): Promise<QuizLikes | null> {
  if (!UUID.test(quizId)) return null;
  const [owner] = await db.select({ ownerId: quiz.ownerId }).from(quiz).where(eq(quiz.id, quizId));
  if (owner === undefined || owner.ownerId !== ownerId) return null;
  const rows = await db
    .select({ kind: userLike.kind, questionId: userLike.questionId, n: sql<number>`count(*)::int` })
    .from(userLike)
    .where(and(eq(userLike.quizId, quizId), eq(userLike.hidden, false), inArray(userLike.kind, ['question', 'quiz'])))
    .groupBy(userLike.kind, userLike.questionId);
  const result: QuizLikes = { quiz: 0, questions: {} };
  for (const row of rows) {
    if (row.kind === 'quiz') result.quiz += row.n;
    else if (row.questionId !== null) result.questions[row.questionId] = row.n;
  }
  return result;
}

/** quiz — нова вікторина (hidden = id не в questionIdsOf) або null (видалено: hidden = true для question і quiz). */
export async function syncHiddenLikes(db: Db | Tx, quizId: string, quiz: Quiz | null): Promise<void> {
  if (quiz === null) {
    await db
      .update(userLike)
      .set({ hidden: true })
      .where(and(eq(userLike.quizId, quizId), inArray(userLike.kind, ['question', 'quiz'])));
    return;
  }
  const ids = [...questionIdsOf(quiz)];
  await db
    .update(userLike)
    .set({ hidden: ids.length === 0 ? true : sql`not (${inArray(userLike.questionId, ids)})` })
    .where(and(eq(userLike.quizId, quizId), eq(userLike.kind, 'question')));
}
