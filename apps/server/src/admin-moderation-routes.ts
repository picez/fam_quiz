import {
  adminFeedQuerySchema,
  adminGroupDeleteSchema,
  adminGroupHideSchema,
  adminGroupItemSchema,
  adminGroupMemberAddSchema,
  adminGroupOwnerSchema,
  adminHideSchema,
  adminListQuerySchema,
  groupReason,
  type AdminGroupMemberAdded,
} from '@quiz/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { z } from 'zod';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { ensureBotAccount } from './bot-account';
import {
  adminAddItem,
  adminAddMember,
  adminDeleteGroup,
  adminFeed,
  adminGroup,
  adminGroups,
  adminRemoveMember,
  adminTransferOwner,
  setFeedHidden,
  setGroupHidden,
  setItemHidden,
} from './moderation-store';
import { subscriptionsOf } from './push-store';

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

const FAIL_STATUS = {
  group_not_found: 404,
  not_found: 404,
  member_not_found: 404,
  item_not_found: 404,
  owner_must_transfer: 409,
  group_name_mismatch: 409,
  // 72: додати учасника й запис
  user_not_found: 404,
  member_banned: 409,
  group_hidden: 409,
  already_member: 409,
  group_full: 409,
  member_too_many_groups: 409,
  group_items_full: 409,
  bot_unavailable: 409,
} as const;

/** 72: 400 з причиною, якщо вона відома (як у group-routes: { error: 'invalid_payload', reason }). */
function invalidItem(reply: FastifyReply, error: z.ZodError) {
  const reason = groupReason(error);
  return reply.code(400).send(reason === null ? INVALID : { ...INVALID, reason });
}

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

  app.post<{ Params: { id: string } }>('/api/admin/groups/:id/members', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGroupMemberAddSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const { userId } = body.data;
    // 72: людина одразу в групі, сповіщення — у «Вхідних» (у тій самій транзакції); пуш — особистий, як відповідь на скаргу (64):
    // незалежно від admin_push, у фоні, після коміту.
    const done = await adminAddMember(db, { adminId: me.id, groupId: id, userId, now: now() });
    if (!done.ok) return reply.code(FAIL_STATUS[done.error]).send({ error: done.error });
    const pushed = deps.push !== null && (await subscriptionsOf(db, [userId])).length > 0;
    deps.push?.background(deps.push.deliver([userId], { kind: 'group_added', groupId: id, title: done.groupName }));
    return { changed: true, pushed } satisfies AdminGroupMemberAdded;
  });

  app.post<{ Params: { id: string } }>('/api/admin/groups/:id/items', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGroupItemSchema.safeParse(request.body ?? {});
    if (!body.success) return invalidItem(reply, body.error);
    // 72: автор — Квіз-бот; його рядок створюється за потреби (як у бота-ведучого), зайнята пошта бота — 409.
    if (!(await ensureBotAccount(db))) return reply.code(409).send({ error: 'bot_unavailable' });
    const done = await adminAddItem(db, { adminId: me.id, groupId: id, item: body.data, now: now() });
    if (done.ok) return reply.code(201).send({ id: done.itemId });
    if (done.error === 'about_not_member') return reply.code(400).send({ ...INVALID, reason: 'about_not_member' });
    return reply.code(FAIL_STATUS[done.error]).send({ error: done.error });
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
