import { leaguePickSchema, lobbySettingsSchema, type LeaguePickInfo, type LobbySettings } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { familyGroup } from './db/schema';
import { listGroups, membership } from './group-store';
import type { Invites } from './invites';
import type { LobbyGate } from './lobby-access';
import { lobbyRows } from './lobby-store';
import { joinableOf, type Room, type RoomManager } from './rooms/manager';
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

/** Вибір групи ліги (45) для ведучого: позначка кімнати й лише його групи. */
async function leaguePickOf(db: Db, room: Room, userId: string): Promise<LeaguePickInfo> {
  const { groups } = await listGroups(db, userId);
  return {
    groupId: room.league?.groupId ?? null,
    // 63: приховану адміністратором групу власник бачить у списку груп, але не в лобі.
    groups: groups.filter((g) => g.hidden === undefined).map(({ id, name, emoji, people }) => ({ id, name, emoji, people })),
  };
}

export async function registerLobbyRoutes(app: FastifyInstance, deps: LobbyDeps): Promise<void> {
  const { db, manager, locate, currentUser } = deps;
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

  /** Відкриті лобі для того, хто дивиться (гостям теж); пароля в рядках нема. */
  app.get('/api/lobbies', perUser('lobbies', 60), async (request) => {
    const viewerId = (await currentUser(request))?.id ?? null;
    const open = manager
      .rooms()
      .filter(
        (room) =>
          joinableOf(room) !== null && room.hostUserId !== null && room.hostUserId !== viewerId && room.lobby.visibility !== 'hidden',
      );
    return lobbyRows(db, open, viewerId);
  });

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

  /** Гра для сімейної ліги (45): ведучий чи автор автопілота; у спробі виклику панелі немає. */
  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/league', perUser('lobby', 30), async (request, reply) => {
    const room = await hostedRoom(request.params.code, request);
    if (room === 'restarting') return reply.code(503).send(RESTARTING);
    if (room === null || room.challenge !== null || room.hostUserId === null) return reply.code(404).send(NOT_FOUND);
    return leaguePickOf(db, room, room.hostUserId);
  });

  app.put<{ Params: { code: string } }>('/api/games/by-code/:code/league', perUser('lobby', 30), async (request, reply) => {
    const room = await hostedRoom(request.params.code, request);
    if (room === 'restarting') return reply.code(503).send(RESTARTING);
    if (room === null || room.hostUserId === null) return reply.code(404).send(NOT_FOUND);
    const body = leaguePickSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const { groupId } = body.data;
    let league: { groupId: string; groupName: string } | null = null;
    if (groupId !== null) {
      const role = await membership(db, groupId, room.hostUserId);
      const [group] = role === null ? [] : await db.select({ name: familyGroup.name }).from(familyGroup).where(eq(familyGroup.id, groupId));
      if (group === undefined) return reply.code(404).send({ error: 'group_not_found' });
      league = { groupId, groupName: group.name };
    }
    const done = manager.setLeague(room, league);
    if (!done.ok) {
      const status = done.error === 'restarting' ? 503 : done.error === 'game_not_found' ? 404 : 409;
      return reply.code(status).send({ error: done.error });
    }
    return leaguePickOf(db, room, room.hostUserId);
  });
}
