import { broadcastInputSchema, broadcastPreviewSchema, type AdminBroadcast, type AdminBroadcasts, type BroadcastPreview } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { botGroups } from './bot-plan-store';
import { audienceOf, broadcastLimits, groupTargetOk, createBroadcast, finishBroadcast, inboxAudienceOf, listBroadcasts } from './broadcast-store';
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
    // 70: у «Вхідні» — усі адресати; сповіщенням — лише підписані (і лише коли на сервері є push).
    const people = (await inboxAudienceOf(db, body.data.recipients)).length;
    return { people, push: push === null ? 0 : (await audienceOf(db, body.data.recipients)).length };
  });

  app.post('/api/admin/broadcasts', write, async (request, reply): Promise<AdminBroadcast | void> => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const body = broadcastInputSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const input = body.data;
    if (!(await groupTargetOk(db, input.recipients))) return reply.code(404).send({ error: 'group_not_found' });
    // 70: розсилка йде у «Вхідні» всім адресатам; push — додатково підписаним, без VAPID — нікому.
    const people = await inboxAudienceOf(db, input.recipients);
    if (people.length === 0) return reply.code(409).send({ error: 'broadcast_nobody' });
    const inInbox = new Set(people);
    const pushPeople = push === null ? [] : (await audienceOf(db, input.recipients)).filter((id) => inInbox.has(id));
    const made = await createBroadcast(db, { adminId: me.id, input, people, pushPeople, now: now() });
    if (!made.ok) return reply.code(409).send({ error: made.error, nextAt: made.nextAt });
    const { row } = made;
    if (push === null || pushPeople.length === 0) {
      await finishBroadcast(db, row.id, { delivered: 0, failed: 0 }, now());
      return reply.code(201).send({ ...row, status: 'sent' });
    }
    push.background(
      push
        .deliverCounted(pushPeople, { kind: 'broadcast', broadcastId: row.id, title: input.title, text: input.text, url: input.url })
        .then((counts) => finishBroadcast(db, row.id, counts, now()))
        .catch((error) => reportError(error, { where: 'push-broadcast' })),
    );
    return reply.code(201).send(row);
  });
}
