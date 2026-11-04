import { lobbySettingsSchema, type LobbySettings } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import type { Invites } from './invites';
import type { LobbyGate } from './lobby-access';
import type { Room, RoomManager } from './rooms/manager';
import type { Located } from './rooms/store';

export interface LobbyDeps {
  db: Db;
  manager: RoomManager;
  gate: LobbyGate;
  invites: Invites;
  locate: (code: string) => Promise<Located>;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const NOT_FOUND = { error: 'game_not_found' };
const RESTARTING = { error: 'restarting' };

/** Налаштування лобі для ведучого — єдине місце, де пароль іде назовні. */
const settingsOf = (room: Room): LobbySettings => ({ visibility: room.lobby.visibility, password: room.lobby.password });

export async function registerLobbyRoutes(app: FastifyInstance, deps: LobbyDeps): Promise<void> {
  const { manager, locate, currentUser } = deps;
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });

  /** Кімната, якою керує цей користувач; для чужої й для гостя — так само, як для відсутньої. */
  const hostedRoom = async (code: string, request: FastifyRequest): Promise<Room | 'restarting' | null> => {
    if ((await locate(code)) === 'restarting') return 'restarting';
    const user = await currentUser(request);
    const room = manager.get(code);
    return user !== null && room !== undefined && room.hostUserId === user.id ? room : null;
  };

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/lobby', perUser('lobby', 30), async (request, reply) => {
    const room = await hostedRoom(request.params.code, request);
    if (room === 'restarting') return reply.code(503).send(RESTARTING);
    if (room === null) return reply.code(404).send(NOT_FOUND);
    return settingsOf(room);
  });

  app.put<{ Params: { code: string } }>('/api/games/by-code/:code/lobby', perUser('lobby', 30), async (request, reply) => {
    const room = await hostedRoom(request.params.code, request);
    if (room === 'restarting') return reply.code(503).send(RESTARTING);
    if (room === null) return reply.code(404).send(NOT_FOUND);
    const body = lobbySettingsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const done = manager.setLobby(room, body.data);
    if (!done.ok) {
      const status = done.error === 'restarting' ? 503 : done.error === 'game_not_found' ? 404 : 409;
      return reply.code(status).send({ error: done.error });
    }
    return settingsOf(room);
  });
}
