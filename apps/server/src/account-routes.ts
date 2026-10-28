import { z } from 'zod';
import { autopilotCheck, joinSchema, quizSchema, upgradeQuiz } from '@quiz/shared';
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from './quizzes';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from './auth';
import type { Db } from './db/client';
import { hostGame, hostGames, playerHistory, resumeOptions } from './history';
import type { RoomManager } from './rooms/manager';
import type { Located } from './rooms/store';

/** Обмеження для маршрутів, якими можна перебирати коди ігор. */
export const CODE_LIMIT = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

export interface AccountDeps {
  db: Db;
  auth: Auth;
  manager: RoomManager;
  /** Де кімната: тут, за живим іншим процесом (restarting) чи ніде. */
  locate: (code: string) => Promise<Located>;
  maxRooms: number;
  /** Адреса застосунку; від неї будуються адреси запитів до Better Auth. */
  baseURL: string;
  attemptsPerMinute: number;
  /** Чи налаштовано вхід через Google. */
  google: boolean;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export async function registerAccountRoutes(
  app: FastifyInstance,
  deps: AccountDeps,
): Promise<{ currentUser: (request: FastifyRequest) => Promise<CurrentUser | null> }> {
  const { auth } = deps;

  /** Користувач за cookie сесії або null. Зіпсована cookie не є помилкою сервера. */
  const currentUser = async (request: FastifyRequest): Promise<CurrentUser | null> => {
    try {
      const found = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      return found === null ? null : { id: found.user.id, name: found.user.name, email: found.user.email };
    } catch {
      return null;
    }
  };

  // Better Auth працює зі стандартними Request і Response, тому запит Fastify перекладається туди й назад.
  const attempts = deps.attemptsPerMinute;
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: {
      rateLimit: {
        timeWindow: '1 minute',
        // Вхід і реєстрація обмежені суворо, решта запитів авторизації вільніше.
        max: (request: FastifyRequest) => (/\/sign-(in|up)\//.test(request.url) ? attempts : attempts * 6),
        keyGenerator: (request: FastifyRequest) =>
          `${request.ip}:${/\/sign-(in|up)\//.test(request.url) ? 'credentials' : 'other'}`,
      },
    },
    async handler(request, reply) {
      // Адреса будується від налаштованої, а не від заголовка Host, який надсилає клієнт.
      const url = new URL(request.url, deps.baseURL);
      const hasBody = request.method !== 'GET' && request.body !== undefined && request.body !== null;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      return reply.send(response.body === null ? null : await response.text());
    },
  });

  // Клієнт показує кнопку Google лише тоді, коли сервер уміє її обслужити.
  app.get('/api/auth-providers', async () => ({ google: deps.google }));

  app.get('/api/me', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send({ error: 'unauthorized' });
    return user;
  });

  const { db } = deps;
  const UNAUTHORIZED = { error: 'unauthorized' };
  const NOT_FOUND = { error: 'not_found' };
  const INVALID = { error: 'invalid_payload' };
  type WithId = { Params: { id: string } };
  // Сторінка редактора, відкрита ще до оновлення сервера, може надіслати вікторину старого формату.
  const parseQuiz = (body: unknown) => quizSchema.safeParse(upgradeQuiz(body));

  app.get('/api/quizzes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return listQuizzes(db, user.id);
  });

  app.post('/api/quizzes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = parseQuiz(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    return reply.code(201).send({ id: await createQuiz(db, user.id, parsed.data) });
  });

  app.get<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await getQuiz(db, user.id, request.params.id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    return { id: request.params.id, ...found };
  });

  app.get<WithId>('/api/quizzes/:id/autopilot', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await getQuiz(db, user.id, request.params.id);
    if (found === null) return reply.code(404).send(NOT_FOUND);
    return autopilotCheck(found);
  });

  app.put<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = parseQuiz(request.body);
    if (!parsed.success) return reply.code(400).send(INVALID);
    const updated = await updateQuiz(db, user.id, request.params.id, parsed.data);
    return updated ? { id: request.params.id } : reply.code(404).send(NOT_FOUND);
  });

  app.delete<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const deleted = await deleteQuiz(db, user.id, request.params.id);
    return deleted ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });

  const { manager, locate, maxRooms } = deps;
  const RESTARTING = { error: 'restarting' };
  const CREATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const fromSaved = z
    .object({
      quizId: z.string().min(1).max(64),
      /** Гра без ведучого (11g): автор — гравець з цим нікнеймом. */
      autopilot: z.literal(true).optional(),
      nickname: joinSchema.shape.nickname.optional(),
    })
    .strict();

  app.post('/api/games', CREATE_LIMIT, async (request, reply) => {
    // Гру веде лише ведучий з акаунтом і лише зі своєї збереженої вікторини.
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const saved = fromSaved.safeParse(request.body);
    if (!saved.success) return reply.code(400).send(INVALID);
    // Нікнейм потрібен автопілоту й лише йому.
    if ((saved.data.autopilot === true) !== (saved.data.nickname !== undefined)) return reply.code(400).send(INVALID);
    const quiz = await getQuiz(db, user.id, saved.data.quizId);
    if (quiz === null) return reply.code(404).send(NOT_FOUND);

    if (manager.size >= maxRooms) return reply.code(503).send({ error: 'server_busy' });
    // На зупинці нова кімната вже не записалася б у базу.
    if (manager.frozen) return reply.code(503).send(RESTARTING);
    if (saved.data.autopilot === true && saved.data.nickname !== undefined) {
      // Вікторину, яку автопілот провести не може, він і не починає.
      if (autopilotCheck(quiz).blocked.length > 0) return reply.code(409).send({ error: 'autopilot_blocked' });
      const made = manager.createAutopilot(quiz, user.id, saved.data.quizId, saved.data.nickname);
      if (!made.ok) return reply.code(made.error === 'restarting' ? 503 : 409).send({ error: made.error });
      return reply.code(201).send({
        gameId: made.room.id,
        code: made.room.code,
        stageToken: made.room.stageToken,
        token: made.token,
        playerId: made.playerId,
      });
    }
    const room = manager.create(quiz, user.id, saved.data.quizId);
    return reply.code(201).send({
      gameId: room.id,
      code: room.code,
      hostToken: room.hostToken,
      stageToken: room.stageToken,
    });
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/host-access', CODE_LIMIT, async (request, reply) => {
    // До перевірки користувача: відповідь однакова для всіх і не розкриває, чия гра.
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const user = await currentUser(request);
    const room = manager.get(request.params.code);
    // Однакова відповідь для «немає гри» і «не ваша гра», щоб не підтверджувати існування коду.
    // Гра без ведучого токена ведучого не має: та сама відповідь.
    if (user === null || room === undefined || room.hostUserId !== user.id || room.state.autopilot !== undefined) {
      return reply.code(404).send({ error: 'game_not_found' });
    }
    return { hostToken: room.hostToken, stageToken: room.stageToken };
  });

  // «Підставити з попередньої гри» (12r): свої недавні ігри вікторини цієї кімнати; ключ — код, бо пульт і телефон автора знають лише його.
  app.get<{ Params: { code: string } }>('/api/games/by-code/:code/resume', CODE_LIMIT, async (request, reply) => {
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const user = await currentUser(request);
    const room = manager.get(request.params.code);
    // Автор автопілота — власник вікторини з акаунтом: room.hostUserId = його id (createAutopilot). Решті — як у host-access.
    if (user === null || room === undefined || room.hostUserId !== user.id || room.quizId === null) {
      return reply.code(404).send({ error: 'game_not_found' });
    }
    if (room.state.phase !== 'lobby') return reply.code(409).send({ error: 'wrong_phase' });
    return resumeOptions(db, user.id, room.quizId, room.id);
  });

  app.get('/api/games', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return hostGames(db, user.id);
  });

  app.get<WithId>('/api/games/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const found = await hostGame(db, user.id, request.params.id);
    return found === null ? reply.code(404).send(NOT_FOUND) : found;
  });

  app.get('/api/me/history', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return playerHistory(db, user.id);
  });

  return { currentUser };
}
