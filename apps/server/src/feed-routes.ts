import { feedCursorSchema, feedLikeSchema, feedSeenSchema, LIKE_RATE } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { calendarBadge } from './calendar-store';
import type { Db } from './db/client';
import { eventLikes, feedBadge, feedPage, markFeedSeen, pruneFeed, visibleEvent } from './feed-store';
import { saveLike } from './like-store';

export interface FeedDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const INVALID = { error: 'invalid_payload' };

export async function registerFeedRoutes(app: FastifyInstance, deps: FeedDeps): Promise<void> {
  const { db, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  const perUser = (prefix: string, max: number, timeWindow: number | string) => ({
    config: {
      rateLimit: {
        max,
        timeWindow,
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });
  const read = perUser('feed', 60, '1 minute');
  const seen = perUser('feed-seen', 60, '1 minute');
  const like = {
    config: {
      rateLimit: {
        ...perUser('feed-like', LIKE_RATE.max, LIKE_RATE.windowMs).config.rateLimit,
        errorResponseBuilder: () => ({ statusCode: 429, error: 'like_rate' }),
      },
    },
  };

  app.get<{ Querystring: { cursor?: string } }>('/api/me/feed', read, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    let cursor = null;
    if (request.query.cursor !== undefined) {
      const parsed = feedCursorSchema.safeParse(request.query.cursor);
      if (!parsed.success) return reply.code(400).send(INVALID);
      cursor = parsed.data;
    }
    return feedPage(db, user.id, cursor, now());
  });

  app.get('/api/me/feed/badge', read, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const at = now();
    const [feed, calendar] = await Promise.all([feedBadge(db, user.id, at), calendarBadge(db, user.id, at)]);
    return { events: feed.events, ...calendar };
  });

  app.post('/api/me/feed/seen', seen, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = feedSeenSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    await markFeedSeen(db, user.id, new Date(body.data.upTo), now());
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/feed/:id/like', like, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = feedLikeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const at = now();
    const event = await visibleEvent(db, user.id, request.params.id, at);
    if (event === null) return reply.code(404).send({ error: 'not_found' });
    if (event.userId === user.id) return reply.code(403).send({ error: 'like_self' });
    if (event.kind === 'game' && event.gameId === null) return reply.code(404).send({ error: 'not_found' });
    await saveLike(
      db,
      event.kind === 'game'
        ? { userId: user.id, kind: 'player', liked: body.data.liked, gameId: event.gameId, quizId: null, targetUserId: event.userId }
        : { userId: user.id, kind: 'event', liked: body.data.liked, gameId: event.gameId, quizId: null, targetUserId: event.userId, eventKey: event.key },
    );
    const { count, liked } = (await eventLikes(db, user.id, [event]))(event);
    return { liked, likes: count };
  });
}

/** pruneFeed одразу й кожні everyMs (unref); збій — onError. Повертає stop. */
export function startFeedPrune(db: Db, everyMs = 3_600_000, onError: (e: unknown) => void = () => {}): () => void {
  const run = () => {
    pruneFeed(db, new Date()).catch(onError);
  };
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
