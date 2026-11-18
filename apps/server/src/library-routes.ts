import { libraryCopySchema, libraryLikeSchema, libraryOpenSchema, libraryQuerySchema, reportSchema } from '@quiz/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { userLike } from './db/schema';
import { saveLike } from './like-store';
import { fileReport } from './report-store';
import { appealEntry, catalog, closeEntry, copyEntry, entryDetail, myEntries, openEntry, visibleEntry } from './library-store';

export interface LibraryDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };

type IdParams = { Params: { id: string } };
type QuizParams = { Params: { quizId: string } };

export async function registerLibraryRoutes(app: FastifyInstance, deps: LibraryDeps): Promise<void> {
  const { db, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });
  const read = perUser('library', 120);
  const open = perUser('library-open', 20);
  const likeLimit = perUser('library-like', 30);
  const copyLimit = perUser('library-copy', 10);
  const reportLimit = perUser('report', 5);

  const signedIn = async (request: FastifyRequest, reply: FastifyReply): Promise<CurrentUser | null> => {
    const user = await currentUser(request);
    if (user === null) await reply.code(401).send(UNAUTHORIZED);
    return user;
  };

  // Власні записи — до /:id; Fastify й так віддає статичний шлях першим, а «mine» не uuid.
  app.get('/api/library/mine', read, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    return myEntries(db, user.id);
  });

  app.put<QuizParams>('/api/library/mine/:quizId', open, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = libraryOpenSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await openEntry(db, user.id, request.params.quizId, body.data.language, now());
    if (!result.ok) return reply.code(result.error === 'not_found' ? 404 : 409).send({ error: result.error });
    return { entryId: result.entryId };
  });

  app.delete<QuizParams>('/api/library/mine/:quizId', open, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    if (!(await closeEntry(db, user.id, request.params.quizId))) return reply.code(404).send(NOT_FOUND);
    return reply.code(204).send();
  });

  app.post<QuizParams>('/api/library/mine/:quizId/appeal', open, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const result = await appealEntry(db, user.id, request.params.quizId, now());
    if (result === 'ok') return reply.code(204).send();
    return reply.code(result === 'not_found' ? 404 : 409).send({ error: result });
  });

  app.get('/api/library', read, async (request, reply) => {
    // Лише відомі параметри: мітки й кеш-бастери відкидаються, а не дають 400.
    const { q, sort, lang, offset } = (request.query ?? {}) as Record<string, unknown>;
    const query = libraryQuerySchema.safeParse({ q, sort, lang, offset });
    if (!query.success) return reply.code(400).send(INVALID);
    const viewer = await currentUser(request);
    return catalog(db, query.data, viewer?.id ?? null);
  });

  app.get<IdParams>('/api/library/:id', read, async (request, reply) => {
    const viewer = await currentUser(request);
    const found = await entryDetail(db, request.params.id, viewer?.id ?? null);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    return found;
  });

  app.put<IdParams>('/api/library/:id/like', likeLimit, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = libraryLikeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const entry = await visibleEntry(db, request.params.id);
    if (entry === null) return reply.code(404).send(NOT_FOUND);
    await saveLike(db, { userId: user.id, kind: 'quiz', liked: body.data.liked, gameId: null, quizId: entry.quizId });
    // Лічильник і «моє» одним запитом.
    const [row] = await db
      .select({
        likes: sql<number>`count(*)::int`,
        liked: sql<boolean>`coalesce(bool_or(${userLike.userId} = ${user.id}), false)`,
      })
      .from(userLike)
      .where(and(eq(userLike.kind, 'quiz'), eq(userLike.quizId, entry.quizId), eq(userLike.hidden, false)));
    return { likes: Number(row?.likes ?? 0), liked: Boolean(row?.liked) };
  });

  app.post<IdParams>('/api/library/:id/copy', copyLimit, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = libraryCopySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await copyEntry(db, user.id, request.params.id, body.data.locale, now());
    if (!result.ok) return reply.code(result.error === 'not_found' ? 404 : 409).send({ error: result.error });
    return reply.code(201).send({ id: result.quizId });
  });

  app.post('/api/reports', reportLimit, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = reportSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await fileReport(db, user.id, body.data, now());
    if (result === 'not_found') return reply.code(404).send(NOT_FOUND);
    if (result !== 'ok') return reply.code(409).send({ error: result });
    return reply.code(201).send({ ok: true });
  });
}
