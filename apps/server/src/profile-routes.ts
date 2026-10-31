import { profileUpdateSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { achievementsPage } from './achievement-store';
import type { Db } from './db/client';
import { versusOf } from './versus';
import { ensureProfile, findByNickname, friendsOf, ownProfile, publicProfile, saveProfile, setFollow } from './profiles';

export interface ProfileDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const MAX_ID_LENGTH = 64;
const MAX_QUERY_LENGTH = 100;

export async function registerProfileRoutes(app: FastifyInstance, deps: ProfileDeps): Promise<void> {
  const { db, currentUser } = deps;

  app.get('/api/me/profile', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return ownProfile(db, user);
  });

  // Лише картка профілю (нікнейм, аватар), без статистики: форма входу в гру підставляє нікнейм.
  app.get('/api/me/card', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const card = await ensureProfile(db, user.id);
    if (card === null) return reply.code(404).send(NOT_FOUND);
    return card;
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

  app.get('/api/me/achievements', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return achievementsPage(db, user.id, true);
  });

  // Чужа сторінка (і своя, відкрита як публічна): лише отримані, без поступу.
  app.get<{ Params: { id: string } }>(
    '/api/profiles/:id/achievements',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { id } = request.params;
      if (id.length > MAX_ID_LENGTH) return reply.code(404).send(NOT_FOUND);
      const found = await achievementsPage(db, id, false);
      return found ?? reply.code(404).send(NOT_FOUND);
    },
  );

  app.get<{ Querystring: { nickname?: unknown } }>(
    '/api/profiles',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: async (request: FastifyRequest) => `find:${(await currentUser(request))?.id ?? request.ip}`,
        },
      },
    },
    async (request, reply) => {
      const user = await currentUser(request);
      if (user === null) return reply.code(401).send(UNAUTHORIZED);
      const { nickname } = request.query;
      if (typeof nickname !== 'string' || nickname.length === 0 || nickname.length > MAX_QUERY_LENGTH) {
        return reply.code(400).send({ error: 'invalid_payload' });
      }
      const found = await findByNickname(db, nickname);
      return found ?? reply.code(404).send(NOT_FOUND);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/me/versus/:id',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: async (request: FastifyRequest) => `versus:${(await currentUser(request))?.id ?? request.ip}`,
        },
      },
    },
    async (request, reply) => {
      const user = await currentUser(request);
      if (user === null) return reply.code(401).send(UNAUTHORIZED);
      const { id } = request.params;
      if (id === user.id) return reply.code(400).send({ error: 'self_versus' });
      if (id.length > MAX_ID_LENGTH || (await ensureProfile(db, id)) === null) return reply.code(404).send(NOT_FOUND);
      return versusOf(db, user.id, id);
    },
  );

  app.get('/api/me/friends', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return friendsOf(db, user.id);
  });

  app.put<{ Params: { id: string } }>('/api/me/friends/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const { id } = request.params;
    if (id === user.id) return reply.code(400).send({ error: 'self_follow' });
    if (id.length > MAX_ID_LENGTH || (await ensureProfile(db, id)) === null) return reply.code(404).send(NOT_FOUND);
    await setFollow(db, user.id, id, true);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/me/friends/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const { id } = request.params;
    if (id.length <= MAX_ID_LENGTH) await setFollow(db, user.id, id, false);
    return reply.code(204).send();
  });
}
