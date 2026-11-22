import { inboxReadSchema, type InboxBadge, type InboxPage } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { inboxPage, inboxUnread, markInboxRead } from './inbox-store';

const UNAUTHORIZED = { error: 'unauthorized' };
const INVALID = { error: 'invalid_payload' };
const READ_BODY_LIMIT = 1024;

export interface InboxRouteDeps {
  db: Parameters<typeof inboxPage>[0];
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

/** «Вхідні» (70): лише акаунт; гість — 401. */
export async function registerInboxRoutes(app: FastifyInstance, deps: InboxRouteDeps): Promise<void> {
  const { db, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  // Ліміт на акаунт (як стрічка): меню опитує бейдж раз на хвилину й на кожен перехід.
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });
  const list = perUser('inbox:user', 60);
  const badge = perUser('inbox-badge:user', 60);
  const mark = perUser('inbox-read:user', 30);

  app.get('/api/me/inbox', list, async (request, reply): Promise<InboxPage | void> => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return inboxPage(db, user.id);
  });

  app.get('/api/me/inbox/badge', badge, async (request, reply): Promise<InboxBadge | void> => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return { unread: await inboxUnread(db, user.id) };
  });

  app.post('/api/me/inbox/read', { bodyLimit: READ_BODY_LIMIT, ...mark }, async (request, reply): Promise<InboxBadge | void> => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = inboxReadSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    return { unread: await markInboxRead(db, { userId: user.id, upTo: new Date(body.data.upTo), now: now() }) };
  });
}
