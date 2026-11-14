import {
  allSpares,
  LIKES_PAGE,
  nextOffset,
  questionIdsOf,
  roundQuestions,
  type GivenLike,
  type LikeKind,
  type LikesPage,
  type LikeTotals,
  type ProfileCard,
  type Quiz,
  type QuizLikes,
  type ReceivedLike,
} from '@quiz/shared';
import { and, asc, desc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { profile, quiz, userLike } from './db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Одна зміна з кімнати (подія 'like') чи зі стрічки (event); targetUserId для host / player / event — від того, хто кличе, для question / quiz його бере saveLike з quiz.owner_id. */
export interface LikeChange {
  userId: string;
  kind: LikeKind;
  liked: boolean;
  /** null — лише для event без гри. */
  gameId: string | null;
  quizId: string | null;
  questionId?: string;
  targetUserId?: string;
  /** Лише event: feed_event.key. */
  eventKey?: string;
}

/** Ключ лайка в пам'яті кімнати: 'quiz' | 'host' | `q:${questionId}` | `p:${targetUserId}` | `e:${eventKey}` (event у кімнаті не трапляється, але тип повний). */
export type LikeKey = string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ключ рядка в пам'яті кімнати. */
function keyOf(row: { kind: LikeKind; questionId: string | null; targetUserId: string; eventKey: string | null }): LikeKey {
  if (row.kind === 'question') return `q:${row.questionId}`;
  if (row.kind === 'player') return `p:${row.targetUserId}`;
  if (row.kind === 'event') return `e:${row.eventKey}`;
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
  if (change.kind === 'event') return and(mine, eq(userLike.eventKey, change.eventKey!))!;
  if (change.kind === 'host') return and(mine, eq(userLike.gameId, change.gameId!))!;
  return and(mine, eq(userLike.gameId, change.gameId!), eq(userLike.targetUserId, change.targetUserId!))!;
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
  if (change.kind === 'event' && change.eventKey === undefined) return null;
  const target = change.targetUserId;
  if (target === undefined || target === change.userId) return null;
  return { targetUserId: target, hidden: false };
}

/**
 * liked → insert onConflictDoNothing (hidden для question — за questionIdsOf вікторини в базі); інакше delete за ключем виду.
 * event: ключ — (user_id, event_key), gameId може бути null (uuid перевіряється, лише якщо він є), без eventKey — нічого.
 * Нічого не пише: gameId не uuid (для event — лише якщо він є), user = target, вікторини немає (question/quiz, liked = true), акаунта цілі чи того, хто лайкає, уже немає (23503).
 */
export async function saveLike(db: Db, change: LikeChange): Promise<void> {
  if (change.gameId === null ? change.kind !== 'event' : !UUID.test(change.gameId)) return;
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
          eventKey: change.kind === 'event' ? change.eventKey! : null,
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
    .select({
      userId: userLike.userId,
      kind: userLike.kind,
      questionId: userLike.questionId,
      targetUserId: userLike.targetUserId,
      eventKey: userLike.eventKey,
    })
    .from(userLike)
    .where(and(inArray(userLike.userId, input.userIds), or(and(inArray(userLike.kind, ['question', 'quiz']), eq(userLike.quizId, input.quizId)), thisGame)));
  for (const row of rows) mine.get(row.userId)?.add(keyOf(row));
  return { author, mine };
}

/** Лайки, які людина отримала як автор (question + quiz), ведучий і гравець (player + event під подіями стрічки); лише hidden = false. */
export async function likeTotals(db: Db, userId: string): Promise<LikeTotals> {
  const rows = await db
    .select({ kind: userLike.kind, n: sql<number>`count(*)::int` })
    .from(userLike)
    .where(and(eq(userLike.targetUserId, userId), eq(userLike.hidden, false)))
    .groupBy(userLike.kind);
  const of = (kind: LikeKind) => rows.find((r) => r.kind === kind)?.n ?? 0;
  return { author: of('question') + of('quiz'), host: of('host'), player: of('player') + of('event') };
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

type QuizBody = Pick<Quiz, 'rounds' | 'spares'>;

/** Усі запитання вікторини (основні в порядку раундів, потім запасні): id і текст. */
function questionTexts(body: QuizBody): { id: string; text: string }[] {
  const seen = new Set<string>();
  const result: { id: string; text: string }[] = [];
  for (const q of [...body.rounds.flatMap(roundQuestions), ...allSpares(body)]) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    result.push({ id: q.id, text: q.text });
  }
  return result;
}

const LIST_KINDS = ['quiz', 'question'] as const;

/** «Мені сподобались»: рядок на вікторину, де я ставив ❤️ вікторині чи запитанням (видимі — лічильником, усі — датою); видалена — рядок без тексту; де всі приховані, а вікторина є — рядка немає. */
export async function givenLikes(db: Db, userId: string, offset: number): Promise<LikesPage<GivenLike>> {
  const lastAt = sql`max(${userLike.createdAt})`.mapWith(userLike.createdAt);
  const visible = sql<number>`(count(*) filter (where not ${userLike.hidden}))::int`;
  const groups = await db
    .select({ quizId: userLike.quizId, lastAt, visible })
    .from(userLike)
    .leftJoin(quiz, eq(quiz.id, userLike.quizId))
    .where(and(eq(userLike.userId, userId), inArray(userLike.kind, [...LIST_KINDS]), isNotNull(userLike.quizId)))
    .groupBy(userLike.quizId)
    .having(sql`count(${quiz.id}) = 0 or count(*) filter (where not ${userLike.hidden}) > 0`)
    .orderBy(sql`max(${userLike.createdAt}) desc`, asc(userLike.quizId))
    .limit(LIKES_PAGE + 1)
    .offset(offset);
  const page = groups.slice(0, LIKES_PAGE);
  const next = nextOffset(groups.length, offset, LIKES_PAGE);
  if (page.length === 0) return { items: [], next };
  const ids = page.map((g) => g.quizId!);
  const [mine, quizzes] = await Promise.all([
    db
      .select({ quizId: userLike.quizId, kind: userLike.kind, questionId: userLike.questionId, hidden: userLike.hidden })
      .from(userLike)
      .where(and(eq(userLike.userId, userId), inArray(userLike.kind, [...LIST_KINDS]), inArray(userLike.quizId, ids))),
    db
      .select({ id: quiz.id, ownerId: quiz.ownerId, title: quiz.title, rounds: quiz.rounds, settings: quiz.settings })
      .from(quiz)
      .where(inArray(quiz.id, ids)),
  ]);
  const owners = [...new Set(quizzes.map((q) => q.ownerId))];
  const cards =
    owners.length === 0
      ? []
      : await db.select({ id: profile.userId, nickname: profile.nickname, avatar: profile.avatar }).from(profile).where(inArray(profile.userId, owners));
  const items: GivenLike[] = page.map((group) => {
    const found = quizzes.find((q) => q.id === group.quizId);
    const iso = group.lastAt.toISOString();
    if (found === undefined) return { quizId: group.quizId!, quiz: null, count: 0, lastAt: iso, quizLiked: false, questions: [], gone: 0 };
    const rows = mine.filter((r) => r.quizId === group.quizId);
    const liked = new Set(rows.filter((r) => r.kind === 'question' && !r.hidden).map((r) => r.questionId));
    const author: ProfileCard = cards.find((c) => c.id === found.ownerId) ?? { id: found.ownerId, nickname: null, avatar: null };
    return {
      quizId: group.quizId!,
      quiz: { title: found.title, author },
      count: group.visible,
      lastAt: iso,
      quizLiked: rows.some((r) => r.kind === 'quiz' && !r.hidden),
      questions: questionTexts({ rounds: found.rounds, spares: found.settings.spares })
        .filter((q) => liked.has(q.id))
        .map((q) => q.text),
      gone: rows.filter((r) => r.kind === 'question' && r.hidden).length,
    };
  });
  return { items, next };
}

/** «Сподобались іншим»: мої вікторини з видимими ❤️ (вікторині й запитанням), найвподобаніші першими; до 3 найвподобаніших запитань. */
export async function receivedLikes(db: Db, userId: string, offset: number): Promise<LikesPage<ReceivedLike>> {
  const total = sql<number>`count(*)::int`;
  const groups = await db
    .select({
      quizId: quiz.id,
      title: quiz.title,
      rounds: quiz.rounds,
      settings: quiz.settings,
      total,
      people: sql<number>`count(distinct ${userLike.userId})::int`,
    })
    .from(quiz)
    .innerJoin(userLike, and(eq(userLike.quizId, quiz.id), eq(userLike.hidden, false), inArray(userLike.kind, [...LIST_KINDS])))
    .where(eq(quiz.ownerId, userId))
    .groupBy(quiz.id)
    .orderBy(desc(total), asc(quiz.title), asc(quiz.id))
    .limit(LIKES_PAGE + 1)
    .offset(offset);
  const page = groups.slice(0, LIKES_PAGE);
  const next = nextOffset(groups.length, offset, LIKES_PAGE);
  if (page.length === 0) return { items: [], next };
  const perQuestion = await db
    .select({ quizId: userLike.quizId, questionId: userLike.questionId, n: sql<number>`count(*)::int` })
    .from(userLike)
    .where(
      and(
        eq(userLike.kind, 'question'),
        eq(userLike.hidden, false),
        inArray(
          userLike.quizId,
          page.map((g) => g.quizId),
        ),
      ),
    )
    .groupBy(userLike.quizId, userLike.questionId);
  const items: ReceivedLike[] = page.map((group) => {
    const counts = new Map(perQuestion.filter((r) => r.quizId === group.quizId).map((r) => [r.questionId, r.n]));
    const top = questionTexts({ rounds: group.rounds, spares: group.settings.spares })
      .map((q, order) => ({ text: q.text, count: counts.get(q.id) ?? 0, order }))
      .filter((q) => q.count > 0)
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .slice(0, 3)
      .map(({ text, count }) => ({ text, count }));
    return { quizId: group.quizId, title: group.title, total: group.total, people: group.people, top };
  });
  return { items, next };
}
