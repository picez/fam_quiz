import { ACHIEVEMENTS, BOT_USER_ID, adminDeleteSchema, adminGiftSchema, adminGrantSchema, adminMergeSchema, adminRevokeManySchema, adminXpSchema, isBotUser, type AccountMergePreview, type AchievementId, type AdminRevokeManyResult, type GameDetail } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import { deleteAccount } from './account-delete';
import { mergeAccounts, mergeLabel, previewMerge, type MergeOutcome } from './account-merge';
import { isAdmin } from './admin';
import type { AdminDeps } from './admin-routes';
import { user } from './db/schema';
import { hostGameWithFacts } from './history';
import { grantAchievement, adjustXp, revokeAchievement } from './player-card';
import { giftPrize, revokeGift } from './player-gifts';
import { reportError } from './log';
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
    // Уже забране (друга вкладка, другий адмін) — своя 404: картка перечитується, а not_found веде на головну.
    if (result === 'not_owned') return reply.code(404).send({ error: 'achievement_not_owned' });
    return result === 'revoked' ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  // 69: «Відібрати вибрані» — по одному тією самою revokeAchievement: кожне — своя транзакція, свій запис у журналі й announce.
  app.post<UserParams>('/api/admin/users/:id/achievements/revoke', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (unknownUser(id)) return reply.code(404).send(NOT_FOUND);
    const body = adminRevokeManySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const revoked: AchievementId[] = [];
    const notOwned: AchievementId[] = [];
    for (const achievementId of body.data.achievementIds) {
      const result = await revokeAchievement(db, { adminId: me.id, userId: id, achievementId, now: now() });
      if (result === 'not_found') return reply.code(404).send(NOT_FOUND); // людини немає — далі не йдемо
      (result === 'revoked' ? revoked : notOwned).push(achievementId);
    }
    // Усе вже забрали (друга вкладка) — та сама помилка, що в одиничного: картка перечитується.
    if (revoked.length === 0) return reply.code(404).send({ error: 'achievement_not_owned' });
    return reply.code(200).send({ revoked, notOwned } satisfies AdminRevokeManyResult);
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
    // Подарунка вже немає (чи це не подарунок) — gift_not_found: картка перечитується, а не веде на головну.
    return (await revokeGift(db, { adminId: me.id, awardId: id, now: now() })) ? reply.code(204).send() : reply.code(404).send({ error: 'gift_not_found' });
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
    // Кімнати, які він веде, переходять до бота й закриваються (як closeHostedBy) ще до видалення: фініш пишеться з ведучим-ботом.
    const seats = manager.forgetUser(id);
    let result: Awaited<ReturnType<typeof deleteAccount>>;
    try {
      result = await deleteAccount(db, { adminId: me.id, userId: id, now: now(), adminEmails });
    } catch (error) {
      // Транзакція відкотилась і акаунт лишився, але кімнати вже закрито: його ігри, які він вів, закінчено (ведучий — бот), а його
      // місця в чужих кімнатах відв'язано (догравав як гість). Повторне видалення доробить решту; це не відкочується.
      reportError(error, { where: 'admin-delete-account', what: `${seats} seats unbound before the failure` });
      return reply.code(500).send({ error: 'delete_failed' });
    }
    if (result === 'cannot_delete_admin') return reply.code(409).send({ error: 'cannot_delete_admin' });
    return result === 'deleted' ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  // Об'єднання акаунтів (66): :id — головний (P, лишається), другий (S) — :otherId чи secondaryId тіла. Жива гра в пам'яті цього
  // процесу й зупинка — тут, до транзакції; решта відмов (адмін, бан, кімнати інших процесів у базі) — під замком у mergeAccounts.
  const liveHere = (P: string, S: string): boolean => manager.inLiveGame(P) || manager.inLiveGame(S);

  app.get<{ Params: { id: string; otherId: string } }>('/api/admin/users/:id/merge/:otherId', read, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id: P, otherId: S } = request.params;
    if (unknownUser(P) || unknownUser(S)) return reply.code(404).send(NOT_FOUND);
    if (P === S) return reply.code(400).send({ error: 'merge_same' });
    if (manager.frozen) return reply.code(503).send({ error: 'restarting' });
    const input = { adminId: me.id, primaryId: P, secondaryId: S, now: now(), adminEmails, localRooms: manager.roomCodes() };
    const preview = await previewMerge(db, input, liveHere(P, S) ? 'merge_live' : null);
    return preview === null ? reply.code(404).send(NOT_FOUND) : (preview satisfies AccountMergePreview);
  });

  app.post<UserParams>('/api/admin/users/:id/merge', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id: P } = request.params;
    if (unknownUser(P)) return reply.code(404).send(NOT_FOUND);
    const body = adminMergeSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const S = body.data.secondaryId;
    if (unknownUser(S)) return reply.code(404).send(NOT_FOUND);
    if (P === S) return reply.code(400).send({ error: 'merge_same' });
    // На зупинці кімнати вже записані й віддаються наступному процесу: перев'язати місця в них уже не вийде.
    if (manager.frozen) return reply.code(503).send({ error: 'restarting' });
    if (liveHere(P, S)) return reply.code(409).send({ error: 'merge_live' });
    const label = await mergeLabel(db, S);
    if (label === null) return reply.code(404).send(NOT_FOUND);
    // Точний збіг з регістром (план: confirm.trim() дорівнює мітці), але після NFC: «й», набране розкладеною формою, — той самий нік.
    if (body.data.confirm.trim().normalize('NFC') !== label.normalize('NFC')) return reply.code(400).send({ error: 'confirm_mismatch' });
    let outcome: MergeOutcome;
    try {
      // Одразу після фіксації, ще до рівня (announce усередині mergeAccounts): сесії S уже видалено транзакцією (його /api/me — 401);
      // місця S у кімнатах пам'яті — до P, щоб рекордер (user_id з playerUsers, події в черзі — за місцем) лишив зв'язок з головним
      // і жоден запис між фіксацією й перев'язкою не впирався в зовнішній ключ видаленого S.
      outcome = await mergeAccounts(db, { adminId: me.id, primaryId: P, secondaryId: S, now: now(), adminEmails, localRooms: manager.roomCodes() }, () => {
        manager.rebindUser(S, P);
      });
    } catch (error) {
      reportError(error, { where: 'admin-merge-accounts' });
      return reply.code(500).send({ error: 'merge_failed' });
    }
    if (!outcome.ok) {
      if (outcome.error === 'not_found') return reply.code(404).send(NOT_FOUND);
      return reply.code(outcome.error === 'merge_same' ? 400 : 409).send({ error: outcome.error });
    }
    return reply.code(200).send({ primaryId: P, summary: outcome.summary });
  });

  app.get<UserParams>('/api/admin/games/:id', read, async (request, reply) => {
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const found = await hostGameWithFacts(db, null, id);
    return found === null ? reply.code(404).send(NOT_FOUND) : (found.detail satisfies GameDetail);
  });
}
