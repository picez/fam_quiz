import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { joinSchema } from '@quiz/shared';
import Fastify from 'fastify';
import { registerAccountRoutes } from './account-routes';
import { createAuth, type AuthOptions } from './auth';
import type { Db } from './db/client';
import { Invites, registerInviteRoutes } from './invites';
import { registerProfileRoutes } from './profile-routes';
import { attachRecorder } from './recorder';
import { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';
import { attachSockets } from './socket';
import { memoryStorage, type ImageStorage } from './storage/images';
import { registerUploadRoutes } from './upload-routes';

export interface AppOptions {
  db: Db;
  auth: AuthOptions;
  scheduler?: Scheduler;
  rng?: () => number;
  /**
   * Брати адресу клієнта із заголовка X-Forwarded-For (потрібно за проксі, наприклад на Render).
   * Число означає кількість проксі перед сервером; true довіряє заголовку повністю.
   */
  trustProxy?: boolean | number;
  /** Скільки кімнат може існувати одночасно. */
  maxRooms?: number;
  /** Де лежать зображення до запитань; без нього вони живуть у пам'яті процесу. */
  storage?: ImageStorage;
  /** Тека зі зібраним web-клієнтом. */
  webRoot?: string;
  /** Заставки переходів; типово вимкнено, справжній сервер (main.ts) вмикає. */
  transitions?: boolean;
}

const DEFAULT_MAX_ROOMS = 500;
const BODY_LIMIT = 512 * 1024;

/** Обмеження для маршрутів, якими можна перебирати коди ігор. */
const CODE_LIMIT = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

export async function buildApp(options: AppOptions) {
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng, { transitions: options.transitions ?? false });
  const recorder = attachRecorder(manager, options.db);
  const maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
  // Fastify приймає й кількість проксі; з об'єднаним типом його оголошення вибирають не той вид сервера.
  const trustProxy = (options.trustProxy ?? false) as boolean;
  const app = Fastify({ trustProxy, bodyLimit: BODY_LIMIT });
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  const { currentUser } = await registerAccountRoutes(app, {
    db: options.db,
    auth: createAuth(options.db, options.auth),
    manager,
    maxRooms,
    baseURL: options.auth.baseURL,
    attemptsPerMinute: options.auth.attemptsPerMinute ?? 10,
    google: options.auth.google !== undefined,
  });

  await registerUploadRoutes(app, { storage: options.storage ?? memoryStorage(), currentUser });
  await registerProfileRoutes(app, { db: options.db, currentUser });
  const invites = new Invites(manager);
  await registerInviteRoutes(app, { db: options.db, manager, invites, currentUser });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code', CODE_LIMIT, async (request, reply) => {
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    return { phase: room.state.phase, title: room.state.quiz.title };
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/join', CODE_LIMIT, async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    // Гравець з акаунтом потрапляє у власну історію ігор; без акаунта чи з простроченою сесією грає як гість.
    const account = await currentUser(request);
    const joined = manager.join(request.params.code, body.data.nickname, account?.id ?? null);
    if (!joined.ok) {
      return reply.code(joined.error === 'game_not_found' ? 404 : 409).send({ error: joined.error });
    }
    return reply.code(201).send({ token: joined.token, playerId: joined.playerId });
  });

  if (options.webRoot !== undefined) await app.register(fastifyStatic, { root: options.webRoot });

  app.setNotFoundHandler((request, reply) => {
    const isPage =
      options.webRoot !== undefined &&
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/socket.io/');
    // Маршрути сторінок обробляє клієнт, тому на них віддається та сама сторінка.
    if (isPage) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });

  const io = attachSockets(app.server, manager);
  // Відкриті WebSocket-з'єднання не дали б HTTP-серверу завершитись.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
  });

  return { app, manager, io, recorder, invites };
}
