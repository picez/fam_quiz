import type { GameReplay } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { logAction } from './bans';
import { game } from './db/schema';
import { gameReplay } from './game-replay';

const NOT_FOUND = { error: 'not_found' };
const VIEW_LOG_MS = 60_000;

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

/** Повтор гри по кроках (65): за воротами адмінки (read), не-адміну й гостю — та сама 404; гра, що йде, — 409 replay_running. */
export async function registerAdminReplayRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db } = deps;
  const { read, adminOf } = guards;
  const now = deps.now ?? (() => new Date());
  // Один перегляд повтору гри одним адміном — один рядок журналу на хвилину (StrictMode і перемикання кроків читають знову).
  const viewed = new Map<string, number>();

  app.get<{ Params: { id: string } }>('/api/admin/games/:id/replay', read, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const replay = await gameReplay(db, request.params.id);
    if (replay === null) return reply.code(404).send(NOT_FOUND);
    if (replay === 'running') return reply.code(409).send({ error: 'replay_running' });
    const at = now();
    const key = `${me.id}:${replay.id}`;
    for (const [seen, time] of viewed) if (at.getTime() - time >= VIEW_LOG_MS) viewed.delete(seen);
    if (!viewed.has(key)) {
      const [found] = await db.select({ hostId: game.hostId }).from(game).where(eq(game.id, replay.id));
      await logAction(db, { adminId: me.id, kind: 'game_replay_view', targetUserId: found?.hostId ?? null, details: { title: replay.title, code: replay.code }, now: at });
      viewed.set(key, at.getTime());
    }
    return replay satisfies GameReplay;
  });
}
