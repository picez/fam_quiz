import {
  LIBRARY_MIN_QUESTIONS,
  LIBRARY_PAGE,
  LIBRARY_QUERY_MAX,
  authorLine,
  nextOffset,
  questionsOf,
  quizSchema,
  roundTypesOf,
  upgradeQuiz,
  withAuthorLine,
  type LibraryCard,
  type LibraryDetail,
  type LibraryMine,
  type LibraryPage,
  type LibrarySort,
  type Locale,
  type RoundType,
} from '@quiz/shared';
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { game, libraryCopy, libraryEntry, profile, quiz, userLike } from './db/schema';
import { notHidden } from './feed-store';
import { createQuiz, quizOf } from './quizzes';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Пошуковий рядок для ilike: коротше двох символів — без фільтра; %, _ і \ екрануються; не довше за max. */
export function escapeLike(q: string | undefined, max: number): string | null {
  const text = (q ?? '').trim().slice(0, max);
  if (text.length < 2) return null;
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Видно в каталозі: відкрито автором, без модерації, автор не заблокований. */
const visible = (): SQL => and(eq(libraryEntry.listed, true), eq(libraryEntry.moderation, 'ok'), notHidden(libraryEntry.ownerId))!;

/** ❤️ вікторини: рядки user_like виду quiz, не приховані. */
const likesOf = sql<number>`(select count(*)::int from ${userLike} where ${userLike.kind} = 'quiz' and ${userLike.quizId} = ${libraryEntry.quizId} and ${userLike.hidden} = false)`;

const likedBy = (viewerId: string | null) =>
  viewerId === null
    ? sql<boolean>`false`
    : sql<boolean>`exists (select 1 from ${userLike} where ${userLike.kind} = 'quiz' and ${userLike.userId} = ${viewerId} and ${userLike.quizId} = ${libraryEntry.quizId} and ${userLike.hidden} = false)`;

/** Вузькі колонки картки: без знімка. quizId і ownerId — лише для лічильників і «моє», у відповідь не йдуть. */
const cardColumns = (viewerId: string | null) => ({
  id: libraryEntry.id,
  quizId: libraryEntry.quizId,
  ownerId: libraryEntry.ownerId,
  title: libraryEntry.title,
  description: libraryEntry.description,
  questionCount: libraryEntry.questionCount,
  roundTypes: libraryEntry.roundTypes,
  language: libraryEntry.language,
  nickname: profile.nickname,
  likes: likesOf,
  liked: likedBy(viewerId),
});

interface CardRow {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  questionCount: number;
  roundTypes: RoundType[];
  language: Locale;
  nickname: string | null;
  likes: number;
  liked: boolean;
}

function toCard(row: CardRow, viewerId: string | null, plays: number): LibraryCard {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    author: row.nickname ?? '',
    questionCount: row.questionCount,
    roundTypes: row.roundTypes,
    language: row.language,
    likes: Number(row.likes ?? 0),
    plays,
    ...(viewerId === null ? {} : { liked: Boolean(row.liked) }),
    ...(viewerId !== null && viewerId === row.ownerId ? { mine: true as const } : {}),
  };
}

/** «Зіграли N разів»: завершені ігри вікторин-копій записів; один груповий запит на сторінку. */
async function playsOf(db: Db, entryIds: string[]): Promise<Map<string, number>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db
    .select({ entryId: libraryCopy.entryId, n: sql<number>`count(*)::int` })
    .from(libraryCopy)
    .innerJoin(game, eq(game.quizId, libraryCopy.quizId))
    .where(and(inArray(libraryCopy.entryId, entryIds), eq(game.status, 'finished')))
    .groupBy(libraryCopy.entryId);
  return new Map(rows.map((row) => [row.entryId, Number(row.n)]));
}

export type OpenResult = { ok: true; entryId: string } | { ok: false; error: 'not_found' | 'library_invalid' | 'library_too_few' | 'library_hidden' };

/**
 * Відкрити чи оновити знімок своєї вікторини. Прихований модератором запис не оновлюється.
 * Вікторина — копія з бібліотеки: рядок «Автор: …» оригінального автора лишається в описі знімка (сама вікторина не змінюється).
 */
export async function openEntry(db: Db, ownerId: string, quizId: string, language: Locale, now: Date): Promise<OpenResult> {
  if (!UUID.test(quizId)) return { ok: false, error: 'not_found' };
  return db.transaction(async (tx): Promise<OpenResult> => {
    const [row] = await tx
      .select({ title: quiz.title, description: quiz.description, settings: quiz.settings, rounds: quiz.rounds })
      .from(quiz)
      .where(and(eq(quiz.id, quizId), eq(quiz.ownerId, ownerId)));
    if (row === undefined) return { ok: false, error: 'not_found' };
    const parsed = quizSchema.safeParse(quizOf(row));
    if (!parsed.success) return { ok: false, error: 'library_invalid' };
    const questionCount = questionsOf(parsed.data).length;
    if (questionCount < LIBRARY_MIN_QUESTIONS) return { ok: false, error: 'library_too_few' };

    const [copy] = await tx
      .select({ line: libraryCopy.authorLine })
      .from(libraryCopy)
      .where(eq(libraryCopy.quizId, quizId))
      .orderBy(desc(libraryCopy.at), desc(libraryCopy.id))
      .limit(1);
    const originLine = copy?.line ?? null;
    const snapshot =
      originLine !== null && !parsed.data.description.includes(originLine)
        ? { ...parsed.data, description: withAuthorLine(parsed.data.description, originLine) }
        : parsed.data;

    const values = {
      title: snapshot.title,
      description: snapshot.description,
      language,
      snapshot,
      questionCount,
      roundTypes: roundTypesOf(snapshot),
      originLine,
      listed: true,
      updatedAt: now,
    };
    const [entry] = await tx
      .insert(libraryEntry)
      .values({ quizId, ownerId, ...values, openedAt: now })
      .onConflictDoUpdate({ target: libraryEntry.quizId, set: values, setWhere: eq(libraryEntry.moderation, 'ok') })
      .returning({ id: libraryEntry.id });
    if (entry === undefined) return { ok: false, error: 'library_hidden' };
    return { ok: true, entryId: entry.id };
  });
}

/** Закрити: запис лишається зі станом модерації, лише listed = false. */
export async function closeEntry(db: Db, ownerId: string, quizId: string): Promise<boolean> {
  if (!UUID.test(quizId)) return false;
  const rows = await db
    .update(libraryEntry)
    .set({ listed: false })
    .where(and(eq(libraryEntry.quizId, quizId), eq(libraryEntry.ownerId, ownerId)))
    .returning({ id: libraryEntry.id });
  return rows.length > 0;
}

export async function myEntries(db: Db, ownerId: string): Promise<LibraryMine[]> {
  const rows = await db
    .select({
      quizId: libraryEntry.quizId,
      entryId: libraryEntry.id,
      listed: libraryEntry.listed,
      moderation: libraryEntry.moderation,
      appealedAt: libraryEntry.appealedAt,
      appealOpen: libraryEntry.appealOpen,
      language: libraryEntry.language,
      updatedAt: libraryEntry.updatedAt,
      likes: likesOf,
    })
    .from(libraryEntry)
    .where(eq(libraryEntry.ownerId, ownerId))
    .orderBy(desc(libraryEntry.updatedAt), libraryEntry.id);
  const plays = await playsOf(
    db,
    rows.map((row) => row.entryId),
  );
  return rows.map((row) => ({
    quizId: row.quizId,
    entryId: row.entryId,
    listed: row.listed,
    moderation: row.moderation,
    appealed: row.appealedAt !== null,
    appealOpen: row.appealOpen,
    language: row.language,
    updatedAt: row.updatedAt.toISOString(),
    likes: Number(row.likes ?? 0),
    plays: plays.get(row.entryId) ?? 0,
  }));
}

/** Одне оскарження на запис і лише для прихованого модератором. */
export async function appealEntry(db: Db, ownerId: string, quizId: string, now: Date): Promise<'ok' | 'not_found' | 'library_not_hidden' | 'library_appeal_used'> {
  if (!UUID.test(quizId)) return 'not_found';
  const mine = and(eq(libraryEntry.quizId, quizId), eq(libraryEntry.ownerId, ownerId));
  const updated = await db
    .update(libraryEntry)
    .set({ appealedAt: now, appealOpen: true })
    .where(and(mine, eq(libraryEntry.moderation, 'hidden'), isNull(libraryEntry.appealedAt)))
    .returning({ id: libraryEntry.id });
  if (updated.length > 0) return 'ok';
  const [row] = await db.select({ moderation: libraryEntry.moderation }).from(libraryEntry).where(mine);
  if (row === undefined) return 'not_found';
  return row.moderation === 'hidden' ? 'library_appeal_used' : 'library_not_hidden';
}

export async function catalog(
  db: Db,
  query: { q?: string; sort: LibrarySort; lang?: Locale; offset: number },
  viewerId: string | null,
): Promise<LibraryPage> {
  const like = escapeLike(query.q, LIBRARY_QUERY_MAX);
  const where = and(
    visible(),
    like === null ? undefined : sql`(${libraryEntry.title} ilike ${like} or ${libraryEntry.description} ilike ${like})`,
    query.lang === undefined ? undefined : eq(libraryEntry.language, query.lang),
  );
  const order =
    query.sort === 'popular'
      ? [sql`${likesOf} desc`, desc(libraryEntry.openedAt), libraryEntry.id]
      : [desc(libraryEntry.openedAt), libraryEntry.id];
  const rows = await db
    .select(cardColumns(viewerId))
    .from(libraryEntry)
    .leftJoin(profile, eq(profile.userId, libraryEntry.ownerId))
    .where(where)
    .orderBy(...order)
    .limit(LIBRARY_PAGE + 1)
    .offset(query.offset);
  const page = rows.slice(0, LIBRARY_PAGE);
  const plays = await playsOf(
    db,
    page.map((row) => row.id),
  );
  return { items: page.map((row) => toCard(row, viewerId, plays.get(row.id) ?? 0)), next: nextOffset(rows.length, query.offset, LIBRARY_PAGE) };
}

/** Сторінка вікторини: картка, раунди (лише назва й тип) і дати; невидимий запис — null (і власникові теж). */
export async function entryDetail(db: Db, entryId: string, viewerId: string | null): Promise<LibraryDetail | null> {
  if (!UUID.test(entryId)) return null;
  const rounds = sql<{ title: string; type: RoundType }[] | null>`(select jsonb_agg(jsonb_build_object('title', coalesce(r->>'title', ''), 'type', r->>'type') order by n) from jsonb_array_elements(${libraryEntry.snapshot}->'rounds') with ordinality as t(r, n))`;
  const [row] = await db
    .select({ ...cardColumns(viewerId), rounds, openedAt: libraryEntry.openedAt, updatedAt: libraryEntry.updatedAt })
    .from(libraryEntry)
    .leftJoin(profile, eq(profile.userId, libraryEntry.ownerId))
    .where(and(eq(libraryEntry.id, entryId), visible()));
  if (row === undefined) return null;
  const plays = await playsOf(db, [row.id]);
  return {
    ...toCard(row, viewerId, plays.get(row.id) ?? 0),
    rounds: (row.rounds ?? []).map((round) => ({ title: round.title, type: round.type })),
    openedAt: row.openedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Видимий у каталозі запис (listed, ok, автор не заблокований) або null. */
export async function visibleEntry(db: Db | Tx, entryId: string): Promise<{ id: string; quizId: string; ownerId: string; title: string } | null> {
  if (!UUID.test(entryId)) return null;
  const [row] = await db
    .select({ id: libraryEntry.id, quizId: libraryEntry.quizId, ownerId: libraryEntry.ownerId, title: libraryEntry.title })
    .from(libraryEntry)
    .where(and(eq(libraryEntry.id, entryId), visible()));
  return row ?? null;
}

/**
 * Копія запису в «Мої вікторини»: увесь вміст і ті самі адреси медіа; опис — з «Автор: …» мовою копіювальника
 * (копія копії — рядок оригінального автора, що вже є в описі знімка).
 */
export async function copyEntry(
  db: Db,
  userId: string,
  entryId: string,
  locale: Locale,
  now: Date,
): Promise<{ ok: true; quizId: string } | { ok: false; error: 'not_found' | 'library_own' }> {
  return db.transaction(async (tx): Promise<{ ok: true; quizId: string } | { ok: false; error: 'not_found' | 'library_own' }> => {
    const entry = await visibleEntry(tx, entryId);
    if (entry === null) return { ok: false, error: 'not_found' };
    if (entry.ownerId === userId) return { ok: false, error: 'library_own' };
    const [row] = await tx
      .select({ snapshot: libraryEntry.snapshot, originLine: libraryEntry.originLine, nickname: profile.nickname })
      .from(libraryEntry)
      .leftJoin(profile, eq(profile.userId, libraryEntry.ownerId))
      .where(eq(libraryEntry.id, entry.id));
    if (row === undefined) return { ok: false, error: 'not_found' };
    const source = quizSchema.parse(upgradeQuiz(row.snapshot));
    const line = row.originLine ?? authorLine(locale, row.nickname);
    const description = row.originLine !== null ? source.description : withAuthorLine(source.description, line);
    const quizId = await createQuiz(tx, userId, { ...source, description });
    await tx.insert(libraryCopy).values({ entryId: entry.id, userId, quizId, authorLine: line, at: now });
    return { ok: true, quizId };
  });
}
