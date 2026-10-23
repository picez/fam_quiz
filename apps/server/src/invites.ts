import type { GameInvite } from '@quiz/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { follow } from './db/schema';
import { ensureProfile, isFollowing } from './profiles';
import type { Room, RoomManager } from './rooms/manager';

/** Скільки людей можна запросити в одну кімнату. */
export const MAX_INVITES_PER_ROOM = 30;

interface RoomInvites {
  room: Room;
  /** Запрошений → мить запрошення. */
  users: Map<string, number>;
  /** Ті, хто відхилив або вже приєднався: повторне запрошення (чи вилучення з кімнати) їх не повертає. */
  dismissed: Set<string>;
}

/**
 * Запрошення в лобі, лише в пам'яті процесу. Запрошення живе, поки кімната існує і чекає в лобі;
 * ключ — room.id, бо код закритої кімнати можуть видати новій.
 */
export class Invites {
  private readonly manager: RoomManager;
  private readonly rooms = new Map<string, RoomInvites>();

  constructor(manager: RoomManager) {
    this.manager = manager;
    manager.onEvent((room, event) => {
      if (event.type === 'closed' || event.type === 'moved' || room.state.phase !== 'lobby') this.rooms.delete(room.id);
      else this.consumeJoined(room);
    });
  }

  /** Додає ще не запрошених і не відхилених, до MAX_INVITES_PER_ROOM; повертає всіх запрошених кімнати. */
  invite(room: Room, userIds: string[]): string[] {
    if (!this.live(room)) return [];
    let entry = this.rooms.get(room.id);
    if (entry === undefined) {
      entry = { room, users: new Map(), dismissed: new Set() };
      this.rooms.set(room.id, entry);
    }
    const at = this.manager.now();
    for (const userId of userIds) {
      if (entry.users.size >= MAX_INVITES_PER_ROOM) break;
      if (!entry.users.has(userId) && !entry.dismissed.has(userId)) entry.users.set(userId, at);
    }
    this.consumeJoined(room);
    return [...entry.users.keys()];
  }

  invitedTo(room: Room): string[] {
    const entry = this.rooms.get(room.id);
    return entry === undefined || !this.live(room) ? [] : [...entry.users.keys()];
  }

  /** Живі кімнати в лобі, куди запрошено користувача, без відхилених і використаних; найновіші першими. */
  forUser(userId: string): { room: Room; at: number }[] {
    const found: { room: Room; at: number }[] = [];
    for (const { room, users, dismissed } of this.rooms.values()) {
      const at = users.get(userId);
      if (at === undefined || dismissed.has(userId) || !this.live(room)) continue;
      found.push({ room, at });
    }
    return found.sort((a, b) => b.at - a.at);
  }

  dismiss(userId: string, code: string): void {
    const room = this.manager.get(code);
    const entry = room === undefined ? undefined : this.rooms.get(room.id);
    if (entry?.users.has(userId)) entry.dismissed.add(userId);
  }

  /** Приєднання використовує запрошення: вилучений з кімнати гравець не побачить його знову. */
  private consumeJoined(room: Room): void {
    const entry = this.rooms.get(room.id);
    if (entry === undefined) return;
    for (const userId of room.playerUsers.values()) if (entry.users.has(userId)) entry.dismissed.add(userId);
  }

  private live(room: Room): boolean {
    return this.manager.get(room.code) === room && room.state.phase === 'lobby';
  }
}

export interface InviteDeps {
  db: Db;
  manager: RoomManager;
  invites: Invites;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'game_not_found' };
const inviteSchema = z.object({ userIds: z.array(z.string().min(1).max(64)).min(1).max(30) }).strict();

export async function registerInviteRoutes(app: FastifyInstance, deps: InviteDeps): Promise<void> {
  const { db, manager, invites, currentUser } = deps;
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });

  /** Кімната, якою керує цей користувач; для чужої — так само, як для відсутньої. */
  const hostedRoom = (code: string, user: CurrentUser) => {
    const room = manager.get(code);
    return room !== undefined && room.hostUserId === user.id ? room : null;
  };

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/invites', perUser('invite', 30), async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const room = hostedRoom(request.params.code, user);
    if (room === null) return reply.code(404).send(NOT_FOUND);
    const body = inviteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    if (room.state.phase !== 'lobby') return reply.code(409).send({ error: 'wrong_phase' });

    // Запросити можна лише своїх друзів; решта id (і власний) тихо відкидаються.
    const rows = await db
      .select({ id: follow.followeeId })
      .from(follow)
      .where(and(eq(follow.followerId, user.id), inArray(follow.followeeId, body.data.userIds)));
    const friends = new Set(rows.map((row) => row.id));
    const allowed = [...new Set(body.data.userIds)].filter((id) => id !== user.id && friends.has(id));
    return { invited: invites.invite(room, allowed) };
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/invites', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const room = hostedRoom(request.params.code, user);
    if (room === null) return reply.code(404).send(NOT_FOUND);
    return { invited: invites.invitedTo(room) };
  });

  app.get('/api/me/invites', perUser('invites', 60), async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const list: GameInvite[] = [];
    for (const { room, at } of invites.forUser(user.id)) {
      const hostId = room.hostUserId;
      // Ведучий, який прибрав запрошеного з друзів, уже не запрошує його.
      if (hostId === null || !(await isFollowing(db, hostId, user.id))) continue;
      const host = await ensureProfile(db, hostId);
      if (host === null) continue;
      list.push({
        code: room.code,
        title: room.state.quiz.title,
        host: { id: host.id, nickname: host.nickname, avatar: host.avatar },
        invitedAt: new Date(at).toISOString(),
      });
    }
    return list;
  });

  app.delete<{ Params: { code: string } }>('/api/me/invites/:code', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    invites.dismiss(user.id, request.params.code);
    return reply.code(204).send();
  });
}
