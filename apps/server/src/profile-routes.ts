import { favoriteStickersSchema, likesOffsetSchema, localeUpdateSchema, looksSchema, profileUpdateSchema } from '@quiz/shared';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { achievementsPage, setHideAnti } from './achievement-store';
import { isBanned } from './bans';
import type { Db } from './db/client';
import { givenLikes, receivedLikes } from './like-store';
import { versusOf } from './versus';
import { saveLooks, stickerAccessOne } from './xp-store';
import { ensureProfile, favoriteStickers, findByNickname, friendsOf, ownProfile, publicProfile, saveEasy, saveFavoriteStickers, saveLocale, saveProfile, searchProfiles, setFollow } from './profiles';

export interface ProfileDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const MAX_ID_LENGTH = 64;
const MAX_QUERY_LENGTH = 100;
/** Перемикач «Ховати антидосягнення від інших» (12j). */
const hideAntiSchema = z.object({ hide: z.boolean() }).strict();
/** Перемикач «Легкий режим» (31). */
const easySchema = z.object({ on: z.boolean() }).strict();

export async function registerProfileRoutes(app: FastifyInstance, deps: ProfileDeps): Promise<void> {
  const { db, currentUser } = deps;
  /** Немає такої людини або її заблоковано (бан #23): для інших — однаково 404. */
  const hidden = async (id: string) => (await isBanned(db, id)) || (await ensureProfile(db, id)) === null;

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

  app.get('/api/me/stickers', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    // 34: ще й набори за досягнення та рівень успадкування — клієнт закриває рівно те, що відкине сервер.
    const access = await stickerAccessOne(db, user.id);
    return { favorites: await favoriteStickers(db, user.id), packs: access.packs ?? [], legacyLevel: access.legacyLevel ?? null };
  });

  app.put('/api/me/stickers', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = favoriteStickersSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    return { favorites: await saveFavoriteStickers(db, user.id, body.data.favorites) };
  });

  app.put('/api/me/achievements/hide-anti', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = hideAntiSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    return { hideAnti: await setHideAnti(db, user.id, body.data.hide) };
  });

  app.put('/api/me/easy', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = easySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const easyMode = await saveEasy(db, user.id, body.data.on);
    if (easyMode === null) return reply.code(404).send(NOT_FOUND);
    return { easyMode };
  });

  app.put('/api/me/looks', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = looksSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const saved = await saveLooks(db, user.id, body.data);
    if (!saved.ok) return reply.code(409).send({ error: saved.error });
    return { looks: saved.looks };
  });

  app.put(
    '/api/me/locale',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: async (request: FastifyRequest) => `locale:${(await currentUser(request))?.id ?? request.ip}`,
        },
      },
    },
    async (request, reply) => {
      const user = await currentUser(request);
      if (user === null) return reply.code(401).send(UNAUTHORIZED);
      const body = localeUpdateSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
      if (!(await saveLocale(db, user.id, body.data.locale))) return reply.code(404).send(NOT_FOUND);
      return { locale: body.data.locale };
    },
  );

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
      if (id.length > MAX_ID_LENGTH || (await isBanned(db, id))) return reply.code(404).send(NOT_FOUND);
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

  // Підказки пошуку друга (беклог 9): нікнейми, що починаються з q.
  app.get<{ Querystring: { q?: unknown } }>(
    '/api/profiles/search',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: async (request: FastifyRequest) => `search:${(await currentUser(request))?.id ?? request.ip}`,
        },
      },
    },
    async (request, reply) => {
      const user = await currentUser(request);
      if (user === null) return reply.code(401).send(UNAUTHORIZED);
      const { q } = request.query;
      if (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH) return reply.code(400).send({ error: 'invalid_payload' });
      return searchProfiles(db, q, user.id);
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
      if (id.length > MAX_ID_LENGTH || (await hidden(id))) return reply.code(404).send(NOT_FOUND);
      return versusOf(db, user.id, id);
    },
  );

  for (const [path, list] of [
    ['given', givenLikes],
    ['received', receivedLikes],
  ] as const) {
    app.get<{ Querystring: { offset?: string } }>(
      `/api/me/likes/${path}`,
      {
        config: {
          rateLimit: {
            max: 60,
            timeWindow: '1 minute',
            keyGenerator: async (request: FastifyRequest) => `likes-${path}:${(await currentUser(request))?.id ?? request.ip}`,
          },
        },
      },
      async (request, reply) => {
        const user = await currentUser(request);
        if (user === null) return reply.code(401).send(UNAUTHORIZED);
        const { offset } = request.query;
        const parsed = offset === undefined ? { success: true as const, data: 0 } : likesOffsetSchema.safeParse(offset);
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });
        return list(db, user.id, parsed.data);
      },
    );
  }

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
    if (id.length > MAX_ID_LENGTH || (await hidden(id))) return reply.code(404).send(NOT_FOUND);
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
