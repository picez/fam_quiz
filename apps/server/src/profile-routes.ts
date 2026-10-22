import { profileUpdateSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { ownProfile, publicProfile, saveProfile } from './profiles';

export interface ProfileDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const MAX_ID_LENGTH = 64;

export async function registerProfileRoutes(app: FastifyInstance, deps: ProfileDeps): Promise<void> {
  const { db, currentUser } = deps;

  app.get('/api/me/profile', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return ownProfile(db, user);
  });

  app.put('/api/me/profile', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = profileUpdateSchema.safeParse(request.body);
    if (!body.success) {
      const field = body.error.issues[0]?.path[0];
      return reply.code(400).send({ error: field === 'nickname' ? 'nickname_invalid' : 'invalid_payload' });
    }
    const saved = await saveProfile(db, user.id, body.data);
    if (!saved.ok) return reply.code(saved.error === 'nickname_taken' ? 409 : 404).send({ error: saved.error });
    return saved.profile;
  });

  app.get<{ Params: { id: string } }>(
    '/api/profiles/:id',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { id } = request.params;
      if (id.length > MAX_ID_LENGTH) return reply.code(404).send(NOT_FOUND);
      const viewer = await currentUser(request);
      const found = await publicProfile(db, id, viewer?.id ?? null);
      return found ?? reply.code(404).send(NOT_FOUND);
    },
  );
}
