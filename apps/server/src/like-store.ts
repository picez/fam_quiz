import { questionIdsOf, type LikeKind, type LikeTotals, type Quiz, type QuizLikes } from '@quiz/shared';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz, userLike } from './db/schema';
import { quizById } from './quizzes';

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

/** Рядок, який має бути (чи не бути) для цієї зміни; null — писати нічого (немає вікторини, себе чи своє). */
async function resolve(db: Db, change: LikeChange): Promise<{ targetUserId: string; hidden: boolean; key: SQL } | null> {
  const mine = and(eq(userLike.userId, change.userId), eq(userLike.kind, change.kind));
  if (change.kind === 'question' || change.kind === 'quiz') {
    if (change.quizId === null) return null;
    if (change.kind === 'question' && change.questionId === undefined) return null;
    const found = await quizById(db, change.quizId);
    if (found === null || found.ownerId === change.userId) return null;
    if (change.kind === 'quiz') return { targetUserId: found.ownerId, hidden: false, key: and(mine, eq(userLike.quizId, change.quizId))! };
    const questionId = change.questionId!;
    return {
      targetUserId: found.ownerId,
      hidden: !questionIdsOf(found.quiz).has(questionId),
      key: and(mine, eq(userLike.quizId, change.quizId), eq(userLike.questionId, questionId))!,
    };
  }
  const target = change.targetUserId;
  if (target === undefined || target === change.userId || !UUID.test(change.gameId)) return null;
  const key = change.kind === 'host' ? and(mine, eq(userLike.gameId, change.gameId)) : and(mine, eq(userLike.gameId, change.gameId), eq(userLike.targetUserId, target));
  return { targetUserId: target, hidden: false, key: key! };
}

/** liked → insert onConflictDoNothing (hidden для question — за questionIdsOf вікторини в базі); інакше delete за ключем виду. Вікторини немає (question/quiz) або user = target — нічого. */
export async function saveLike(db: Db, change: LikeChange): Promise<void> {
  const row = await resolve(db, change);
  if (row === null) return;
  if (!change.liked) {
    await db.delete(userLike).where(row.key);
    return;
  }
  const own = change.kind === 'question' || change.kind === 'quiz';
  await db
    .insert(userLike)
    .values({
      userId: change.userId,
      kind: change.kind,
      targetUserId: row.targetUserId,
      quizId: change.quizId,
      questionId: change.kind === 'question' ? change.questionId! : null,
      gameId: change.gameId,
      hidden: own ? row.hidden : false,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
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
