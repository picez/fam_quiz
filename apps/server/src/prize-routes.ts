import { placesSchema, prizeContentSchema, type PrizePlacesInfo } from '@quiz/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CurrentUser } from './account-routes';
import { CODE_LIMIT } from './account-routes';
import type { Db } from './db/client';
import { createPrize, deletePrize, listPrizes, reservePlaces, updatePrize } from './prizes';
import type { RoomManager } from './rooms/manager';
import type { Located } from './rooms/store';

export interface PrizeRouteDeps {
  db: Db;
  manager: RoomManager;
  locate: (code: string) => Promise<Located>;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const UUID = z.string().uuid();
const WRITE_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };
const RESTARTING = { error: 'restarting' };
const GAME_NOT_FOUND = { error: 'game_not_found' };

export async function registerPrizeRoutes(app: FastifyInstance, deps: PrizeRouteDeps): Promise<void> {
  const { db, manager, locate, currentUser } = deps;

  app.get('/api/me/prizes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return listPrizes(db, user.id);
  });

  app.post('/api/me/prizes', WRITE_LIMIT, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = prizeContentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    const result = await createPrize(db, user.id, parsed.data);
    return result.ok ? reply.code(201).send(result.prize) : reply.code(409).send({ error: result.error });
  });

  app.put<{ Params: { id: string } }>('/api/me/prizes/:id', WRITE_LIMIT, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = prizeContentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    if (!UUID.safeParse(request.params.id).success) return reply.code(404).send(NOT_FOUND);
    const result = await updatePrize(db, user.id, request.params.id, parsed.data);
    if (result.ok) return result.prize;
    return reply.code(result.error === 'not_found' ? 404 : 409).send({ error: result.error });
  });

  app.delete<{ Params: { id: string } }>('/api/me/prizes/:id', WRITE_LIMIT, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    if (!UUID.safeParse(request.params.id).success) return reply.code(404).send(NOT_FOUND);
    const result = await deletePrize(db, manager, request.params.id, user.id);
    if (result === 'deleted') return reply.code(204).send();
    return reply.code(result === 'not_found' ? 404 : 409).send({ error: result });
  });

  /** Кімната цього процесу, яку веде user; інакше відповідь уже надіслано. */
  const ownRoom = async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    if ((await locate(request.params.code)) === 'restarting') {
      reply.code(503).send(RESTARTING);
      return null;
    }
    const user = await currentUser(request);
    if (user === null) {
      reply.code(401).send(UNAUTHORIZED);
      return null;
    }
    const room = manager.get(request.params.code);
    if (room === undefined || room.hostUserId !== user.id) {
      reply.code(404).send(GAME_NOT_FOUND);
      return null;
    }
    return { user, room };
  };

  const placesOf = (room: { prizes: { place: number; id: string }[] }): PrizePlacesInfo['places'] => {
    const places: PrizePlacesInfo['places'] = [null, null, null];
    for (const placed of room.prizes) places[placed.place - 1] = placed.id;
    return places;
  };

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/prizes', CODE_LIMIT, async (request, reply) => {
    const found = await ownRoom(request, reply);
    if (found === null) return;
    const { user, room } = found;
    const placed = new Set(room.prizes.map((p) => p.id));
    const options = (await listPrizes(db, user.id)).filter((item) => item.status === 'free' || placed.has(item.id));
    const info: PrizePlacesInfo = { options, places: placesOf(room) };
    return info;
  });

  app.put<{ Params: { code: string } }>('/api/games/by-code/:code/prizes', { config: CODE_LIMIT.config }, async (request, reply) => {
    const found = await ownRoom(request, reply);
    if (found === null) return;
    const { user, room } = found;
    const parsed = placesSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    if (room.state.phase !== 'lobby') return reply.code(409).send({ error: 'wrong_phase' });
    const reserved = await reservePlaces(db, user.id, room.id, parsed.data.places);
    if (!reserved.ok) return reply.code(409).send({ error: reserved.error });
    const set = manager.setPrizes(room, reserved.placed);
    if (!set.ok) {
      // Гра стартувала (чи кімнату закрито), поки чекали базу: резерви лишаються тими, що лежать у кімнаті.
      await reservePlaces(db, user.id, room.id, placesOf(room));
      return reply.code(409).send({ error: 'wrong_phase' });
    }
    const placed = new Set(reserved.placed.map((p) => p.id));
    const options = (await listPrizes(db, user.id)).filter((item) => item.status === 'free' || placed.has(item.id));
    const info: PrizePlacesInfo = { options, places: placesOf(room) };
    return info;
  });
}
