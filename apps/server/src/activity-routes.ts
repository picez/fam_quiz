import { editorTimeSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { addEditorTime } from './activity';
import type { Db } from './db/client';

const UNAUTHORIZED = { error: 'unauthorized' };
const INVALID = { error: 'invalid_payload' };
const BODY_LIMIT = 256;

export interface ActivityRouteDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

/** 71: активний час у редакторі — порції від клієнта; лише акаунт, бот не пишеться. Ні змісту, ні id вікторини, ні IP. */
export async function registerActivityRoutes(app: FastifyInstance, deps: ActivityRouteDeps): Promise<void> {
  const { db, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  const limited = {
    config: {
      rateLimit: {
        // Клієнт шле порцію раз на хвилину + залишок при виході; 3 — із запасом, але без «накрутки».
        max: 3,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `editor-time:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  };

  app.post('/api/me/editor-time', { bodyLimit: BODY_LIMIT, ...limited }, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = editorTimeSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    await addEditorTime(db, user.id, body.data, now());
    return reply.code(204).send();
  });
}
