import { ADMIN_CACHE_MS, ANNOUNCEMENT_MAX_DAYS, adminListQuerySchema, announcementInputSchema, adminProfileActionSchema, adminQuizActionSchema, banSchema, type AdminBackupInfo, type AdminHealth } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { isAdmin } from './admin';
import { adminCharts } from './admin-charts';
import { liveRooms } from './admin-live';
import { adminLog, adminQuiz, adminQuizzes, adminStats, adminUser, adminUsers } from './admin-store';
import { activeAnnouncement, clearAnnouncement, setAnnouncement, type AnnouncementCache } from './announcement-store';
import { banUser, logAction, unbanUser } from './bans';
import type { Db } from './db/client';
import { prize } from './db/schema';
import { actOnProfile, actOnQuiz, reportQueue, reportedQuiz } from './report-store';
import { deleteAward, deletePrize } from './prizes';
import { deleteQuestionAsAdmin, deleteQuiz } from './quizzes';
import { latestBackup, parseBackupKey } from './db-backup';
import { reportError } from './log';
import type { RoomManager } from './rooms/manager';
import type { StoredObject } from './storage/r2-objects';
import { ttlCache } from './ttl-cache';

export interface AdminDeps {
  db: Db;
  manager: RoomManager;
  adminEmails: ReadonlySet<string>;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  /** Список копій бази (53); без нього блок «Стан» каже, що сховища немає. */
  backupList?: () => Promise<StoredObject[]>;
  /** Кеш публічного оголошення (53): кожен запис адміна його скидає. */
  announcements: AnnouncementCache;
  now?: () => Date;
}

/** Те саме тіло, що в setNotFoundHandler для невідомого /api/...: адмінки для інших не існує. */
const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID_MAX = 64;
const QUESTION_ID_MAX = 200;
const ROOM_CODE = /^\d{6}$/;

type IdParams = { Params: { id: string } };
type CodeParams = { Params: { code: string } };

export async function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps): Promise<void> {
  const { db, manager, adminEmails, currentUser } = deps;
  const now = deps.now ?? (() => new Date());

  // Один запит — одна перевірка: ворота, ключ обмеження, allowList і сам маршрут питають той самий проміс.
  const checked = new WeakMap<FastifyRequest, Promise<CurrentUser | null>>();
  const adminOf = (request: FastifyRequest): Promise<CurrentUser | null> => {
    let found = checked.get(request);
    if (found === undefined) {
      found = (async () => {
        try {
          if (adminEmails.size === 0) return null;
          const account = await currentUser(request);
          return account !== null && (await isAdmin(db, adminEmails, account.id)) ? account : null;
        } catch {
          // Збій бази не відрізняє адмінку від невідомого маршруту: та сама 404, не 500.
          return null;
        }
      })();
      checked.set(request, found);
    }
    return found;
  };

  /**
   * onRequest маршруту: до розбору тіла й параметрів і до хука обмеження (його плагін дописує свій хук після цього).
   * Не-адмін і анонім отримують 404 як невідомий маршрут; allowList однаково пропускає їх повз лічильник.
   */
  const gate = async (request: FastifyRequest, reply: FastifyReply) => {
    if ((await adminOf(request)) === null) return reply.code(404).send(NOT_FOUND);
  };
  const limited = (prefix: 'admin-read' | 'admin-write', max: number) => ({
    onRequest: gate,
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await adminOf(request))?.id ?? request.ip}`,
        allowList: async (request: FastifyRequest) => (await adminOf(request)) === null,
      },
    },
  });
  const read = limited('admin-read', 120);
  const write = limited('admin-write', 30);

  // Графіки й список копій — раз на 10 хвилин на всіх адмінів (53).
  const cacheClock = () => now().getTime();
  const charts = ttlCache(() => adminCharts(db, now()), ADMIN_CACHE_MS, cacheClock);
  // Збій списку не кешується: ttlCache не зберігає відхилений проміс, і наступний запит питає сховище знову.
  const backups = ttlCache(async (): Promise<AdminBackupInfo> => {
    if (deps.backupList === undefined) return { state: 'off' };
    const newest = latestBackup(await deps.backupList());
    if (newest === null) return { state: 'none' };
    return { state: 'ok', at: parseBackupKey(newest.key)!.at.toISOString(), bytes: newest.size };
  }, ADMIN_CACHE_MS, cacheClock);
  const backupInfo = (): Promise<AdminBackupInfo> =>
    backups.get().catch((error: unknown): AdminBackupInfo => {
      reportError(error, { where: 'admin-health' });
      return { state: 'error' };
    });

  app.get('/api/admin/charts', read, async () => charts.get());

  app.get('/api/admin/health', read, async (): Promise<AdminHealth> => {
    const usage = process.memoryUsage();
    return {
      backup: await backupInfo(),
      uptimeSec: Math.floor(process.uptime()),
      memory: { rss: usage.rss, heapUsed: usage.heapUsed },
      rooms: manager.rooms().filter((room) => room.state.phase !== 'finished').length,
      connections: manager.connectionCount(),
      checkedAt: now().toISOString(),
    };
  });

  app.get('/api/admin/stats', read, async () => {
    const live = manager.rooms().filter((room) => room.state.phase !== 'finished').length;
    return adminStats(db, live, now());
  });

  // «Живі ігри» (53): кімнати цього процесу; ведучі — лише ніки.
  app.get('/api/admin/live', read, async () => liveRooms(db, manager.rooms(), now()));

  app.post<CodeParams>('/api/admin/live/:code/close', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { code } = request.params;
    if (!ROOM_CODE.test(code)) return reply.code(404).send(NOT_FOUND);
    // На зупинці кімнати вже записані й віддаються наступному процесу: закриття тут не втрималося б.
    if (manager.frozen) return reply.code(503).send({ error: 'restarting' });
    const room = manager.get(code);
    if (room === undefined) return reply.code(404).send(NOT_FOUND);
    if (room.state.phase === 'finished') return reply.code(409).send({ error: 'game_finished' });
    // Знімок до закриття: лобі після close з пам'яті зникає.
    const { hostUserId } = room;
    const { title } = room.state.quiz;
    const result = manager.closeByAdmin(code);
    if (result === 'not_found') return reply.code(404).send(NOT_FOUND);
    if (result === 'finished') return reply.code(409).send({ error: 'game_finished' });
    await logAction(db, { adminId: me.id, kind: 'game_close', targetUserId: hostUserId, details: { title, code }, now: now() });
    return reply.code(204).send();
  });

  // Оголошення (53): читання адміна без кешу; записи скидають публічний кеш.
  app.get('/api/admin/announcement', read, async () => ({ announcement: await activeAnnouncement(db, now()) }));

  app.put('/api/admin/announcement', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const body = announcementInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const at = now();
    if (body.data.expiresAt !== null) {
      const expires = Date.parse(body.data.expiresAt);
      if (expires <= at.getTime() || expires > at.getTime() + ANNOUNCEMENT_MAX_DAYS * 86_400_000) {
        return reply.code(400).send({ error: 'announcement_expiry' });
      }
    }
    const saved = await setAnnouncement(db, { adminId: me.id, input: body.data, now: at });
    deps.announcements.clear();
    return saved;
  });

  app.delete('/api/admin/announcement', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    await clearAnnouncement(db, { adminId: me.id, now: now() });
    deps.announcements.clear();
    return reply.code(204).send();
  });

  app.get('/api/admin/users', read, async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    return adminUsers(db, adminEmails, query.data);
  });

  app.get<IdParams>('/api/admin/users/:id', read, async (request, reply) => {
    const { id } = request.params;
    if (id.length > USER_ID_MAX) return reply.code(404).send(NOT_FOUND);
    const detail = await adminUser(db, adminEmails, id, now());
    return detail === null ? reply.code(404).send(NOT_FOUND) : detail;
  });

  app.post<IdParams>('/api/admin/users/:id/ban', write, async (request, reply) => {
    // Після воріт адмін є завжди; перевірка — для типів (і та сама 404, якби ворота зламалися).
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (id.length > USER_ID_MAX) return reply.code(404).send(NOT_FOUND);
    const body = banSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    // На зупинці кімнати вже записані й віддаються наступному процесу: бан без закриття кімнат був би півбаном.
    if (manager.frozen) return reply.code(503).send({ error: 'restarting' });
    if (id === me.id || (await isAdmin(db, adminEmails, id))) return reply.code(409).send({ error: 'cannot_ban_admin' });
    const result = await banUser(db, { adminId: me.id, targetId: id, reason: body.data.reason, now: now() });
    if (!result.ok) return reply.code(404).send(NOT_FOUND);
    manager.closeHostedBy(id);
    return reply.code(204).send();
  });

  app.delete<IdParams>('/api/admin/users/:id/ban', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (id.length > USER_ID_MAX) return reply.code(404).send(NOT_FOUND);
    await unbanUser(db, { adminId: me.id, targetId: id, now: now() });
    return reply.code(204).send();
  });

  app.get('/api/admin/quizzes', read, async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    return adminQuizzes(db, query.data);
  });

  app.get<IdParams>('/api/admin/quizzes/:id', read, async (request, reply) => {
    const view = await adminQuiz(db, request.params.id);
    return view === null ? reply.code(404).send(NOT_FOUND) : view;
  });

  app.delete<IdParams>('/api/admin/quizzes/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const at = now();
    const deleted = await deleteQuiz(db, null, request.params.id, (tx, row) =>
      logAction(tx, { adminId: me.id, kind: 'quiz_delete', targetUserId: row.ownerId, details: { title: row.title }, now: at }),
    );
    return deleted ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.delete<{ Params: { id: string; questionId: string } }>('/api/admin/quizzes/:id/questions/:questionId', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id, questionId } = request.params;
    if (questionId.length > QUESTION_ID_MAX) return reply.code(404).send(NOT_FOUND);
    const at = now();
    const result = await deleteQuestionAsAdmin(db, id, questionId, (tx, done) =>
      logAction(tx, { adminId: me.id, kind: 'question_delete', targetUserId: done.ownerId, details: { title: done.title, text: done.removedText }, now: at }),
    );
    if (!result.ok) return reply.code(result.error === 'not_found' ? 404 : 409).send({ error: result.error });
    const view = await adminQuiz(db, id);
    // Вікторину встигли видалити між записом і читанням.
    return view === null ? reply.code(404).send(NOT_FOUND) : view;
  });

  app.delete<IdParams>('/api/admin/prizes/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const at = now();
    // Рядок під FOR UPDATE: знімок для журналу — саме той зміст, що видаляється; журнал — у тій самій транзакції.
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx.select({ ownerId: prize.ownerId, content: prize.content }).from(prize).where(eq(prize.id, id)).for('update');
      if (row === undefined) return 'not_found' as const;
      const result = await deletePrize(tx as unknown as Db, manager, id, null);
      if (result === 'deleted') {
        await logAction(tx, { adminId: me.id, kind: 'prize_delete', targetUserId: row.ownerId, details: { title: row.content.name, content: row.content }, now: at });
      }
      return result;
    });
    if (outcome === 'deleted') return reply.code(204).send();
    return outcome === 'not_found' ? reply.code(404).send(NOT_FOUND) : reply.code(409).send({ error: outcome });
  });

  app.delete<IdParams>('/api/admin/awards/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const at = now();
    const deleted = await db.transaction(async (tx) => {
      const row = await deleteAward(tx, id);
      if (row === null) return false;
      await logAction(tx, { adminId: me.id, kind: 'award_delete', targetUserId: row.userId, details: { title: row.quizTitle, content: row.content }, now: at });
      return true;
    });
    return deleted ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.get('/api/admin/reports', read, async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    return reportQueue(db, query.data.page);
  });

  // Знімок із каталогу, на який скаржаться (не поточна вікторина автора); лише читання.
  app.get<{ Params: { entryId: string } }>('/api/admin/reports/quiz/:entryId', read, async (request, reply) => {
    const view = await reportedQuiz(db, request.params.entryId);
    return view === null ? reply.code(404).send(NOT_FOUND) : view;
  });

  app.post<{ Params: { entryId: string } }>('/api/admin/reports/quiz/:entryId', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { entryId } = request.params;
    if (!UUID.test(entryId)) return reply.code(404).send(NOT_FOUND);
    const body = adminQuizActionSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const done = await actOnQuiz(db, { adminId: me.id, entryId, action: body.data.action, now: now() });
    return done ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.post<{ Params: { userId: string } }>('/api/admin/reports/profile/:userId', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { userId } = request.params;
    if (userId.length > USER_ID_MAX) return reply.code(404).send(NOT_FOUND);
    const body = adminProfileActionSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    // Адміну нік чи аватар не скидають (той самий код, що й у бана); відхилити скаргу на нього можна.
    if (body.data.action !== 'dismiss' && (userId === me.id || (await isAdmin(db, adminEmails, userId)))) return reply.code(409).send({ error: 'cannot_ban_admin' });
    const done = await actOnProfile(db, { adminId: me.id, userId, action: body.data.action, now: now() });
    return done ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.get('/api/admin/log', read, async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(INVALID);
    return adminLog(db, query.data.page);
  });
}
