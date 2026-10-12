import rateLimit from '@fastify/rate-limit';
import { joinSchema, quizSchema } from '@quiz/shared';
import Fastify from 'fastify';
import { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';
import { attachSockets } from './socket';

export interface AppOptions {
  scheduler?: Scheduler;
  rng?: () => number;
  /** Брати адресу клієнта із заголовка X-Forwarded-For (потрібно за проксі, наприклад на Render). */
  trustProxy?: boolean;
  /** Скільки кімнат може існувати одночасно. */
  maxRooms?: number;
}

const DEFAULT_MAX_ROOMS = 500;
const BODY_LIMIT = 512 * 1024;

/** Обмеження для маршрутів, якими можна перебирати коди ігор. */
const CODE_LIMIT = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };
const CREATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

export async function buildApp(options: AppOptions = {}) {
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng);
  const maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
  const app = Fastify({ trustProxy: options.trustProxy ?? false, bodyLimit: BODY_LIMIT });
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/games', CREATE_LIMIT, async (request, reply) => {
    const quiz = quizSchema.safeParse(request.body);
    if (!quiz.success) return reply.code(400).send({ error: 'invalid_payload' });
    if (manager.size >= maxRooms) return reply.code(503).send({ error: 'server_busy' });
    const room = manager.create(quiz.data);
    return reply.code(201).send({
      gameId: room.id,
      code: room.code,
      hostToken: room.hostToken,
      stageToken: room.stageToken,
    });
  });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code', CODE_LIMIT, async (request, reply) => {
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    return { phase: room.state.phase, title: room.state.quiz.title };
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/join', CODE_LIMIT, async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    const joined = manager.join(request.params.code, body.data.nickname);
    if (!joined.ok) {
      return reply.code(joined.error === 'game_not_found' ? 404 : 409).send({ error: joined.error });
    }
    return reply.code(201).send({ token: joined.token, playerId: joined.playerId });
  });

  const io = attachSockets(app.server, manager);
  // Відкриті WebSocket-з'єднання не дали б HTTP-серверу завершитись.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
  });

  return { app, manager, io };
}
