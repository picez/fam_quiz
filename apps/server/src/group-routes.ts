import {
  groupInputSchema,
  groupInviteSchema,
  groupItemInputSchema,
  groupOwnerSchema,
  groupReason,
  type GroupRole,
} from '@quiz/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { createItem, deleteItem, listItems, updateItem } from './group-items';
import {
  acceptInvite,
  cancelInvite,
  createGroup,
  declineInvite,
  deleteGroup,
  groupDetail,
  invitesFor,
  inviteFriends,
  joinByCode,
  joinPreview,
  leaveGroup,
  listGroups,
  membership,
  refreshCode,
  removeMember,
  transferOwner,
  updateGroup,
} from './group-store';

export interface GroupDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const GROUP_NOT_FOUND = { error: 'group_not_found' };
const NOT_OWNER = { error: 'not_owner' };
const ITEM_NOT_FOUND = { error: 'item_not_found' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 400 з причиною, якщо вона відома (назва, текст, «про кого», сюрприз). */
function invalid(reply: FastifyReply, error: z.ZodError) {
  const reason = groupReason(error);
  return reply.code(400).send(reason === null ? { error: 'invalid_payload' } : { error: 'invalid_payload', reason });
}

/** Помилки сховища → HTTP. */
const STATUS: Record<string, number> = {
  too_many_groups: 409,
  group_full: 409,
  group_items_full: 409,
  owner_must_transfer: 409,
  invites_full: 409,
  member_not_found: 404,
  invite_not_found: 404,
  group_not_found: 404,
  item_not_found: 404,
  not_author: 403,
};

function fail(reply: FastifyReply, error: string) {
  if (error === 'about_not_member') return reply.code(400).send({ error: 'invalid_payload', reason: 'about_not_member' });
  return reply.code(STATUS[error] ?? 400).send({ error });
}

type GroupParams = { Params: { id: string } };

export async function registerGroupRoutes(app: FastifyInstance, deps: GroupDeps): Promise<void> {
  const { db, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });
  const read = perUser('groups', 120);
  const write = perUser('groups-write', 30);
  const join = perUser('groups-join', 20);

  const signedIn = async (request: FastifyRequest, reply: FastifyReply): Promise<CurrentUser | null> => {
    const user = await currentUser(request);
    if (user === null) await reply.code(401).send(UNAUTHORIZED);
    return user;
  };

  /**
   * Сесія → членство в групі. Чужий і неіснуюча група отримують той самий 404; owner — лише власнику (403 not_owner).
   * null — відповідь уже надіслано.
   */
  const member = async (
    request: FastifyRequest<GroupParams>,
    reply: FastifyReply,
    need: GroupRole = 'member',
  ): Promise<{ user: CurrentUser; role: GroupRole; groupId: string } | null> => {
    const user = await signedIn(request, reply);
    if (user === null) return null;
    const groupId = request.params.id;
    const role = UUID.test(groupId) ? await membership(db, groupId, user.id) : null;
    if (role === null) {
      await reply.code(404).send(GROUP_NOT_FOUND);
      return null;
    }
    if (need === 'owner' && role !== 'owner') {
      await reply.code(403).send(NOT_OWNER);
      return null;
    }
    return { user, role, groupId };
  };

  const detail = async (reply: FastifyReply, groupId: string, viewerId: string, code = 200) => {
    const found = await groupDetail(db, groupId, viewerId);
    if (found === null) return reply.code(404).send(GROUP_NOT_FOUND);
    return reply.code(code).send(found);
  };

  app.get('/api/groups', read, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    return listGroups(db, user.id);
  });

  app.post('/api/groups', write, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = groupInputSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, body.error);
    const created = await createGroup(db, user.id, body.data, now());
    if (!created.ok) return fail(reply, created.error);
    return detail(reply, created.id, user.id, 201);
  });

  app.get<GroupParams>('/api/groups/:id', read, async (request, reply) => {
    const ok = await member(request, reply);
    if (ok === null) return reply;
    return detail(reply, ok.groupId, ok.user.id);
  });

  app.put<GroupParams>('/api/groups/:id', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    const body = groupInputSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, body.error);
    await updateGroup(db, ok.groupId, body.data, now());
    return detail(reply, ok.groupId, ok.user.id);
  });

  app.delete<GroupParams>('/api/groups/:id', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    await deleteGroup(db, ok.groupId);
    return reply.code(204).send();
  });

  app.post<GroupParams>('/api/groups/:id/code', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    return { inviteCode: await refreshCode(db, ok.groupId, now()) };
  });

  app.post<GroupParams>('/api/groups/:id/owner', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    const body = groupOwnerSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, body.error);
    const moved = await transferOwner(db, ok.groupId, ok.user.id, body.data.userId);
    if (!moved.ok) return fail(reply, moved.error);
    return detail(reply, ok.groupId, ok.user.id);
  });

  app.delete<{ Params: { id: string; userId: string } }>('/api/groups/:id/members/:userId', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    const removed = await removeMember(db, ok.groupId, ok.user.id, request.params.userId);
    if (!removed.ok) return fail(reply, removed.error);
    return reply.code(204).send();
  });

  app.post<GroupParams>('/api/groups/:id/leave', write, async (request, reply) => {
    const ok = await member(request, reply);
    if (ok === null) return reply;
    const left = await leaveGroup(db, ok.groupId, ok.user.id);
    if (!left.ok) return fail(reply, left.error);
    return reply.code(204).send();
  });

  app.post<GroupParams>('/api/groups/:id/invites', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    const body = groupInviteSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, body.error);
    const sent = await inviteFriends(db, ok.groupId, ok.user.id, body.data.userIds, now());
    if (!sent.ok) return fail(reply, sent.error);
    return { invited: sent.invited };
  });

  app.delete<{ Params: { id: string; userId: string } }>('/api/groups/:id/invites/:userId', write, async (request, reply) => {
    const ok = await member(request, reply, 'owner');
    if (ok === null) return reply;
    await cancelInvite(db, ok.groupId, request.params.userId);
    return reply.code(204).send();
  });

  app.get<GroupParams>('/api/groups/:id/items', read, async (request, reply) => {
    const ok = await member(request, reply);
    if (ok === null) return reply;
    return listItems(db, ok.groupId, ok.user.id, ok.role);
  });

  app.post<GroupParams>('/api/groups/:id/items', write, async (request, reply) => {
    const ok = await member(request, reply);
    if (ok === null) return reply;
    const body = groupItemInputSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, body.error);
    const created = await createItem(db, ok.groupId, ok.user.id, body.data, now());
    if (!created.ok) return fail(reply, created.error);
    return reply.code(201).send(created.item);
  });

  app.put<{ Params: { id: string; itemId: string } }>('/api/groups/:id/items/:itemId', write, async (request, reply) => {
    const ok = await member(request, reply);
    if (ok === null) return reply;
    if (!UUID.test(request.params.itemId)) return reply.code(404).send(ITEM_NOT_FOUND);
    const body = groupItemInputSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, body.error);
    const updated = await updateItem(db, ok.groupId, request.params.itemId, ok.user.id, body.data, now());
    if (!updated.ok) return fail(reply, updated.error);
    return updated.item;
  });

  app.delete<{ Params: { id: string; itemId: string } }>('/api/groups/:id/items/:itemId', write, async (request, reply) => {
    const ok = await member(request, reply);
    if (ok === null) return reply;
    if (!UUID.test(request.params.itemId)) return reply.code(404).send(ITEM_NOT_FOUND);
    const deleted = await deleteItem(db, ok.groupId, request.params.itemId, ok.user.id, ok.role);
    if (!deleted.ok) return fail(reply, deleted.error);
    return reply.code(204).send();
  });

  app.get<{ Params: { code: string } }>('/api/groups/join/:code', join, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const preview = await joinPreview(db, request.params.code, user.id);
    if (preview === null) return reply.code(404).send(GROUP_NOT_FOUND);
    return preview;
  });

  app.post<{ Params: { code: string } }>('/api/groups/join/:code', join, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const joined = await joinByCode(db, request.params.code, user.id, now());
    if (!joined.ok) return fail(reply, joined.error);
    return { id: joined.id };
  });

  app.get('/api/me/group-invites', read, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    return invitesFor(db, user.id);
  });

  app.post<GroupParams>('/api/me/group-invites/:id/accept', join, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const accepted = await acceptInvite(db, request.params.id, user.id, now());
    if (!accepted.ok) return fail(reply, accepted.error);
    return { id: request.params.id };
  });

  app.delete<GroupParams>('/api/me/group-invites/:id', write, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    await declineInvite(db, request.params.id, user.id);
    return reply.code(204).send();
  });
}
