import { SHOWCASE_PIN_KINDS, showcasePinSchema, type ShowcasePinKind } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { pinItem, showcasePins, unpinItem } from './showcase-pins';

export interface ShowcaseRouteDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };

const isKind = (kind: string): kind is ShowcasePinKind => (SHOWCASE_PIN_KINDS as readonly string[]).includes(kind);

/** Вітрини, які обирає гравець (23a): до 3 нагород і 5 ачівок. */
export async function registerShowcaseRoutes(app: FastifyInstance, deps: ShowcaseRouteDeps): Promise<void> {
  const { db, currentUser } = deps;
  // Запис — 30 за хвилину, як WRITE_LIMIT призів; ключ — людина, а не адреса.
  const write = {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `showcase-write:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  };

  app.get('/api/me/showcase/pins', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return showcasePins(db, user.id);
  });

  app.post('/api/me/showcase/pins', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = showcasePinSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    const result = await pinItem(db, user.id, parsed.data);
    if (result.ok) return result.pins;
    return reply.code(result.error === 'not_found' ? 404 : 409).send({ error: result.error });
  });

  app.delete<{ Params: { kind: string; id: string } }>('/api/me/showcase/pins/:kind/:id', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const { kind, id } = request.params;
    if (!isKind(kind)) return reply.code(404).send(NOT_FOUND);
    // Ідемпотентно: незакріплене (чи невідомий id) просто нічого не видаляє.
    return unpinItem(db, user.id, { kind, id } as Parameters<typeof unpinItem>[2]);
  });
}
