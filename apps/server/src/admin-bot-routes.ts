import { IN_ROUND, memberOf, teamsOn } from '@quiz/engine';
import {
  BOT_COMMAND_TYPES,
  BOT_PLANS_MAX,
  BOT_ROOMS_MAX,
  BOT_USER_ID,
  adminBotCopySchema,
  adminBotLobbySchema,
  botCommandSchema,
  type AdminActionKind,
  type AdminBot,
  type AdminBotRoom,
  type AdminBotRoomPerson,
  type AdminBotStatus,
  type BotCommand,
} from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { botQuizzes } from './admin-store';
import { ensureBotAccount } from './bot-account';
import { registerAdminBotScheduleRoutes } from './admin-bot-schedule-routes';
import { openBotGame } from './bot-games';
import { botGroups, listPlans } from './bot-plan-store';
import { logAction } from './bans';
import { profile, user } from './db/schema';
import { createQuiz, deleteQuiz, getQuiz } from './quizzes';
import type { QuizChecker } from './quiz-check';
import type { Room } from './rooms/manager';

const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };
const RESTARTING = { error: 'restarting' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_CODE = /^\d{6}$/;

interface Guards {
  checker: QuizChecker;
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

/** Рядок журналу для кожної успішної дії адміна в кімнаті бота (62). */
const BOT_ROOM_LOG: Record<BotCommand['type'], AdminActionKind> = {
  start: 'bot_room_start',
  pause: 'bot_room_pause',
  resume: 'bot_room_resume',
  end: 'bot_room_end',
  skip: 'bot_room_skip',
  time: 'bot_room_time',
  'end-round': 'bot_room_end_round',
  kick: 'bot_room_kick',
  release: 'bot_room_release',
  'team-form': 'bot_room_teams',
};

/** Картка кімнати бота: нічого із запитань і відповідей — лише прапорець відкритого запитання. */
function botRoomView(room: Room): AdminBotRoom {
  const { state } = room;
  const isOnline = (id: string) => (room.connections.get(id) ?? 0) > 0;
  const online = state.players.filter((p) => isOnline(p.id)).length;
  const people: AdminBotRoomPerson[] = teamsOn(state)
    ? state.teams.members.map((m) => ({ id: m.id, nickname: m.nickname, online: isOnline(m.id), team: state.teams.list.find((t) => t.id === m.teamId)?.name ?? null }))
    : state.players.map((p) => ({ id: p.id, nickname: p.nickname, online: isOnline(p.id), team: null }));
  return {
    question: state.phase === 'question',
    inRound: IN_ROUND.includes(state.phase),
    lobby: { listed: room.lobby.visibility !== 'hidden', password: room.lobby.password },
    people,
    teams: teamsOn(state) ? { form: state.teams.form } : null,
    continued: room.continued !== null,
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
      quizzes: await botQuizzes(db, guards.checker),
      rooms: rooms.map((item) => item.view),
      roomsMax: BOT_ROOMS_MAX,
      schedule: { plans: await listPlans(db), groups: await botGroups(db), max: BOT_PLANS_MAX },
    };
  });

  app.post<{ Params: { id: string } }>('/api/admin/bot/quizzes/:id/games', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const found = await getQuiz(db, BOT_USER_ID, id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    const made = openBotGame({ manager, maxRooms }, found, id);
    if (!made.ok) return reply.code(made.error === 'server_busy' || made.error === 'restarting' ? 503 : 409).send({ error: made.error });
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
    if (!ROOM_CODE.test(code) || !(BOT_COMMAND_TYPES as readonly string[]).includes(action)) return reply.code(404).send(NOT_FOUND);
    if (manager.frozen) return reply.code(503).send(RESTARTING);
    const raw = typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body) ? request.body : {};
    const parsed = botCommandSchema.safeParse({ ...raw, type: action });
    if (!parsed.success) return reply.code(400).send(INVALID);
    const command = parsed.data;
    const room = manager.get(code);
    // Нік людини — до дії: після вилучення її в кімнаті вже немає.
    let text: string | undefined;
    if (room !== undefined && (command.type === 'kick' || command.type === 'release')) {
      const { state } = room;
      const who = teamsOn(state) ? memberOf(state, command.playerId) : state.players.find((p) => p.id === command.playerId);
      text = who?.nickname;
    }
    const done = manager.botAct(code, command);
    if (!done.ok) return done.error === 'game_not_found' ? reply.code(404).send(NOT_FOUND) : reply.code(409).send({ error: done.error });
    await logAction(db, {
      adminId: me.id,
      kind: BOT_ROOM_LOG[command.type],
      targetUserId: BOT_USER_ID,
      details: { title: room?.state.quiz.title, code, ...(text === undefined ? {} : { text }) },
      now: now(),
    });
    return reply.code(204).send();
  });

  app.put<{ Params: { code: string } }>('/api/admin/bot/rooms/:code/lobby', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { code } = request.params;
    if (!ROOM_CODE.test(code)) return reply.code(404).send(NOT_FOUND);
    if (manager.frozen) return reply.code(503).send(RESTARTING);
    const body = adminBotLobbySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const room = manager.get(code);
    const before = room === undefined ? null : { listed: room.lobby.visibility !== 'hidden', password: room.lobby.password };
    const done = manager.botLobby(code, body.data);
    if (!done.ok) {
      if (done.error === 'game_not_found') return reply.code(404).send(NOT_FOUND);
      return reply.code(done.error === 'restarting' ? 503 : 409).send({ error: done.error });
    }
    const { listed, password } = body.data;
    const changed = before === null || before.listed !== listed || before.password !== password;
    if (changed) {
      await logAction(db, {
        adminId: me.id,
        kind: 'bot_room_lobby',
        targetUserId: BOT_USER_ID,
        details: { title: room?.state.quiz.title, code, listed, locked: password !== null },
        now: now(),
      });
    }
    return reply.code(200).send({ listed, password });
  });

  await registerAdminBotScheduleRoutes(app, deps, guards);
}
