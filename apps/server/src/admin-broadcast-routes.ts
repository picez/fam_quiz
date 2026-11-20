import { broadcastInputSchema, broadcastPreviewSchema, type AdminBroadcast, type AdminBroadcasts, type BroadcastPreview } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { botGroups } from './bot-plan-store';
import { audienceOf, broadcastLimits, createBroadcast, finishBroadcast, listBroadcasts } from './broadcast-store';
import { reportError } from './log';

const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

/** Вкладка «Розсилка» (59): усе за воротами адмінки; не-адміну й гостю — та сама 404, що й невідомому маршруту. */
export async function registerAdminBroadcastRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db, push } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());

  app.get('/api/admin/broadcasts', read, async (): Promise<AdminBroadcasts> => {
    const at = now();
    return { rows: await listBroadcasts(db, at), groups: await botGroups(db), limits: await broadcastLimits(db, at), pushOn: push !== null };
  });

  app.post('/api/admin/broadcasts/preview', read, async (request, reply): Promise<BroadcastPreview | void> => {
    const body = broadcastPreviewSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    return { people: (await audienceOf(db, body.data.recipients)).length };
  });

  app.post('/api/admin/broadcasts', write, async (request, reply): Promise<AdminBroadcast | void> => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const body = broadcastInputSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    if (push === null) return reply.code(503).send({ error: 'push_off' });
    const input = body.data;
    const people = await audienceOf(db, input.recipients);
    if (people.length === 0) return reply.code(409).send({ error: 'broadcast_nobody' });
    const made = await createBroadcast(db, { adminId: me.id, input, people, now: now() });
    if (!made.ok) return reply.code(409).send({ error: made.error, nextAt: made.nextAt });
    const { row } = made;
    push.background(
      push
        .deliverCounted(people, { kind: 'broadcast', broadcastId: row.id, title: input.title, text: input.text, url: input.url })
        .then((counts) => finishBroadcast(db, row.id, counts, now()))
        .catch((error) => reportError(error, { where: 'push-broadcast' })),
    );
    return reply.code(201).send(row);
  });
}
