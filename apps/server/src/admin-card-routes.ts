import { ACHIEVEMENTS, BOT_USER_ID, adminDeleteSchema, adminGiftSchema, adminGrantSchema, adminXpSchema, isBotUser, type AchievementId, type GameDetail } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import { deleteAccount } from './account-delete';
import { isAdmin } from './admin';
import type { AdminDeps } from './admin-routes';
import { user } from './db/schema';
import { hostGameWithFacts } from './history';
import { grantAchievement, adjustXp, revokeAchievement } from './player-card';
import { giftPrize, revokeGift } from './player-gifts';
import { ensureProfile } from './profiles';

const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID_MAX = 64;

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

type UserParams = { Params: { id: string } };

/** Картка гравця (58): усе за воротами адмінки (read/write), не-адміну й гостю — та сама 404, що й невідомому маршруту; бот як ціль — 404. */
export async function registerPlayerCardRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db, manager, adminEmails } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());
  const unknownUser = (id: string): boolean => id.length > USER_ID_MAX || id === BOT_USER_ID;

  app.post<UserParams>('/api/admin/users/:id/achievements', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (unknownUser(id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGrantSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await grantAchievement(db, { adminId: me.id, userId: id, achievementId: body.data.achievementId, now: now() });
    if (result === 'not_found') return reply.code(404).send(NOT_FOUND);
    if (result === 'owned') return reply.code(409).send({ error: 'achievement_owned' });
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string; achievementId: string } }>('/api/admin/users/:id/achievements/:achievementId', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id, achievementId } = request.params;
    if (unknownUser(id) || !(ACHIEVEMENTS as readonly string[]).includes(achievementId)) return reply.code(404).send(NOT_FOUND);
    const result = await revokeAchievement(db, { adminId: me.id, userId: id, achievementId: achievementId as AchievementId, now: now() });
    return result === 'revoked' ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.post<UserParams>('/api/admin/users/:id/xp', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (unknownUser(id)) return reply.code(404).send(NOT_FOUND);
    const body = adminXpSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await adjustXp(db, { adminId: me.id, userId: id, amount: body.data.amount, reason: body.data.reason, now: now() });
    if (!result.ok) return result.error === 'xp_below_zero' ? reply.code(409).send({ error: 'xp_below_zero' }) : reply.code(404).send(NOT_FOUND);
    return reply.code(200).send({ xp: result.xp, level: result.level });
  });

  app.post<UserParams>('/api/admin/users/:id/gifts', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (unknownUser(id)) return reply.code(404).send(NOT_FOUND);
    const body = adminGiftSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await giftPrize(db, { adminId: me.id, userId: id, prizeId: body.data.prizeId, note: body.data.note, now: now() });
    if (!result.ok) return reply.code(404).send({ error: result.error });
    return reply.code(201).send({ id: result.awardId });
  });

  app.delete<UserParams>('/api/admin/gifts/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    return (await revokeGift(db, { adminId: me.id, awardId: id, now: now() })) ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.delete<UserParams>('/api/admin/users/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (id.length > USER_ID_MAX) return reply.code(404).send(NOT_FOUND);
    const body = adminDeleteSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    // На зупинці кімнати вже записані й віддаються наступному процесу: видалення без закриття кімнат було б півдією.
    if (manager.frozen) return reply.code(503).send({ error: 'restarting' });
    if (isBotUser(id) || id === me.id || (await isAdmin(db, adminEmails, id))) return reply.code(409).send({ error: 'cannot_delete_admin' });
    const [found] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
    if (found === undefined) return reply.code(404).send(NOT_FOUND);
    const label = (await ensureProfile(db, id))?.nickname ?? found.email;
    if (body.data.confirm.trim() !== label) return reply.code(400).send({ error: 'confirm_mismatch' });
    manager.closeHostedBy(id);
    manager.forgetUser(id);
    return (await deleteAccount(db, { adminId: me.id, userId: id, now: now() })) ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.get<UserParams>('/api/admin/games/:id', read, async (request, reply) => {
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const found = await hostGameWithFacts(db, null, id);
    return found === null ? reply.code(404).send(NOT_FOUND) : (found.detail satisfies GameDetail);
  });
}
