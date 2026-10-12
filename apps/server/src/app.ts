import rateLimit from '@fastify/rate-limit';
import { joinSchema, quizSchema } from '@quiz/shared';
import Fastify from 'fastify';
import { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';

export interface AppOptions {
  scheduler?: Scheduler;
  rng?: () => number;
}

/** Обмеження для маршрутів, якими можна перебирати коди ігор. */
const CODE_LIMIT = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

export async function buildApp(options: AppOptions = {}) {
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng);
  const app = Fastify();
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/games', async (request, reply) => {
    const quiz = quizSchema.safeParse(request.body);
    if (!quiz.success) return reply.code(400).send({ error: 'invalid_payload' });
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

  return { app, manager };
}
