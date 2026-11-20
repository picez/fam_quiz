import { adminFeedQuerySchema, adminGroupDeleteSchema, adminGroupHideSchema, adminGroupOwnerSchema, adminHideSchema, adminListQuerySchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { adminDeleteGroup, adminFeed, adminGroup, adminGroups, adminRemoveMember, adminTransferOwner, setFeedHidden, setGroupHidden, setItemHidden } from './moderation-store';

const NOT_FOUND = { error: 'not_found' };
const GROUP_NOT_FOUND = { error: 'group_not_found' };
const INVALID = { error: 'invalid_payload' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID_MAX = 64;

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const FAIL_STATUS = { group_not_found: 404, not_found: 404, member_not_found: 404, item_not_found: 404, owner_must_transfer: 409, group_name_mismatch: 409 } as const;

/** 63: модерація стрічки й сімейних груп; усе за воротами адмінки (не-адміну й гостю — та сама 404, що й невідомому маршруту). */
export async function registerAdminModerationRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());

  type Done = { ok: true; changed: boolean } | { ok: false; error: keyof typeof FAIL_STATUS };
  const answer = (reply: { code: (n: number) => { send: (b?: unknown) => unknown } }, done: Done) =>
    done.ok ? reply.code(200).send({ changed: done.changed }) : reply.code(FAIL_STATUS[done.error]).send({ error: done.error });

  app.get('/api/admin/feed', read, async (request, reply) => {
    const query = adminFeedQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    return adminFeed(db, query.data);
  });

  app.put<{ Params: { id: string } }>('/api/admin/feed/:id/hidden', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    if (!UUID.test(request.params.id)) return reply.code(404).send(NOT_FOUND);
    const body = adminHideSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    return answer(reply, await setFeedHidden(db, { adminId: me.id, eventId: request.params.id, hidden: body.data.hidden, now: now() }));
  });

  app.get('/api/admin/groups', read, async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    return adminGroups(db, query.data);
  });

  app.get<{ Params: { id: string } }>('/api/admin/groups/:id', read, async (request, reply) => {
    if (!UUID.test(request.params.id)) return reply.code(404).send(NOT_FOUND);
    const query = adminListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    const detail = await adminGroup(db, request.params.id, query.data.page);
    return detail === null ? reply.code(404).send(GROUP_NOT_FOUND) : detail;
  });

  app.put<{ Params: { id: string } }>('/api/admin/groups/:id/hidden', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    if (!UUID.test(request.params.id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGroupHideSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const { hidden, reason } = body.data;
    return answer(reply, await setGroupHidden(db, { adminId: me.id, groupId: request.params.id, hidden, reason: reason ?? null, now: now() }));
  });

  app.delete<{ Params: { id: string; userId: string } }>('/api/admin/groups/:id/members/:userId', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id, userId } = request.params;
    if (!UUID.test(id) || userId.length > USER_ID_MAX) return reply.code(404).send(NOT_FOUND);
    return answer(reply, await adminRemoveMember(db, { adminId: me.id, groupId: id, userId, now: now() }));
  });

  app.put<{ Params: { id: string } }>('/api/admin/groups/:id/owner', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    if (!UUID.test(request.params.id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGroupOwnerSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    return answer(reply, await adminTransferOwner(db, { adminId: me.id, groupId: request.params.id, toId: body.data.userId, now: now() }));
  });

  app.delete<{ Params: { id: string } }>('/api/admin/groups/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    if (!UUID.test(request.params.id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGroupDeleteSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const done = await adminDeleteGroup(db, { adminId: me.id, groupId: request.params.id, name: body.data.name, now: now() });
    return done.ok ? reply.code(204).send() : answer(reply, done);
  });

  app.put<{ Params: { id: string; itemId: string } }>('/api/admin/groups/:id/items/:itemId/hidden', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id, itemId } = request.params;
    if (!UUID.test(id) || !UUID.test(itemId)) return reply.code(404).send(NOT_FOUND);
    const body = adminHideSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    return answer(reply, await setItemHidden(db, { adminId: me.id, groupId: id, itemId, hidden: body.data.hidden, now: now() }));
  });
}
