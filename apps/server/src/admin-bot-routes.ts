import { BOT_ACTIONS, BOT_ROOMS_MAX, BOT_USER_ID, adminBotCopySchema, autopilotCheck, type AdminBot, type AdminBotRoom, type AdminBotStatus, type BotAction } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { botQuizzes } from './admin-store';
import { ensureBotAccount } from './bot-account';
import { logAction } from './bans';
import { profile, user } from './db/schema';
import { createQuiz, deleteQuiz, getQuiz } from './quizzes';
import type { Room } from './rooms/manager';

const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };
const RESTARTING = { error: 'restarting' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_CODE = /^\d{6}$/;

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

/** Стан кімнати бота для адмінки (54): усе, що не лобі, пауза чи кінець, — «грає». */
function botStatus(room: Room): AdminBotStatus {
  const { phase, paused } = room.state;
  if (phase === 'lobby') return 'lobby';
  if (phase === 'finished') return 'finished';
  return paused ? 'paused' : 'playing';
}

function botRoomView(room: Room): AdminBotRoom {
  const online = room.state.players.filter((p) => (room.connections.get(p.id) ?? 0) > 0).length;
  return {
    code: room.code,
    title: room.state.quiz.title,
    status: botStatus(room),
    players: { online, total: room.state.players.length },
    stageUrl: `/stage/${room.code}#${room.stageToken}`,
    openedAt: new Date(room.lobby.openedAt).toISOString(),
  };
}

/** Вкладка «Бот» (54): усе за воротами адмінки; не-адміну й гостю — та сама 404, що й невідомому маршруту. */
export async function registerAdminBotRoutes(app: FastifyInstance, deps: AdminDeps & { maxRooms: number }, guards: Guards): Promise<void> {
  const { db, manager, maxRooms } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());

  app.get('/api/admin/bot', read, async (): Promise<AdminBot> => {
    const [row] = await db.select({ nickname: profile.nickname }).from(user).leftJoin(profile, eq(profile.userId, user.id)).where(eq(user.id, BOT_USER_ID));
    const rooms = manager
      .botRooms()
      .map((room) => ({ view: botRoomView(room), opened: room.lobby.openedAt }))
      .sort((x, y) => Number(x.view.status === 'finished') - Number(y.view.status === 'finished') || y.opened - x.opened);
    return {
      bot: { nickname: row?.nickname ?? null, ready: row !== undefined },
      quizzes: await botQuizzes(db),
      rooms: rooms.map((item) => item.view),
      roomsMax: BOT_ROOMS_MAX,
    };
  });

  app.post<{ Params: { id: string } }>('/api/admin/bot/quizzes/:id/games', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const found = await getQuiz(db, BOT_USER_ID, id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    if (manager.size >= maxRooms) return reply.code(503).send({ error: 'server_busy' });
    if (manager.frozen) return reply.code(503).send(RESTARTING);
    if (autopilotCheck(found).blocked.length > 0) return reply.code(409).send({ error: 'autopilot_blocked' });
    const made = manager.createBotRoom(found, id);
    if (!made.ok) return reply.code(made.error === 'restarting' ? 503 : 409).send({ error: made.error });
    const { room } = made;
    await logAction(db, { adminId: me.id, kind: 'bot_game_start', targetUserId: BOT_USER_ID, details: { title: found.title, code: room.code }, now: now() });
    return reply.code(201).send({ code: room.code, stageUrl: `/stage/${room.code}#${room.stageToken}` });
  });

  app.post('/api/admin/bot/copies', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const body = adminBotCopySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const own = await getQuiz(db, me.id, body.data.quizId);
    if (own === null) return reply.code(404).send(NOT_FOUND);
    // Пошту бота може займати чужий акаунт: тоді бота немає, і це ясна відповідь, а не 500.
    if (!(await ensureBotAccount(db))) return reply.code(409).send({ error: 'bot_unavailable' });
    const id = await db.transaction(async (tx) => {
      const created = await createQuiz(tx, BOT_USER_ID, own);
      await logAction(tx, { adminId: me.id, kind: 'bot_copy', targetUserId: BOT_USER_ID, details: { title: own.title }, now: now() });
      return created;
    });
    return reply.code(201).send({ id });
  });

  app.delete<{ Params: { id: string } }>('/api/admin/bot/quizzes/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    // Жива кімната з цією вікториною догравається: у неї свій знімок.
    const done = await deleteQuiz(db, BOT_USER_ID, id, (tx, deleted) =>
      logAction(tx, { adminId: me.id, kind: 'bot_quiz_delete', targetUserId: BOT_USER_ID, details: { title: deleted.title }, now: now() }),
    );
    return done ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  app.post<{ Params: { code: string; action: string } }>('/api/admin/bot/rooms/:code/:action', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { code, action } = request.params;
    if (!ROOM_CODE.test(code) || !(BOT_ACTIONS as readonly string[]).includes(action)) return reply.code(404).send(NOT_FOUND);
    if (manager.frozen) return reply.code(503).send(RESTARTING);
    const done = manager.botAct(code, action as BotAction);
    if (done.ok) return reply.code(204).send();
    return done.error === 'game_not_found' ? reply.code(404).send(NOT_FOUND) : reply.code(409).send({ error: done.error });
  });
}
