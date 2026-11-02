import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { joinSchema } from '@quiz/shared';
import Fastify from 'fastify';
import { CODE_LIMIT, registerAccountRoutes } from './account-routes';
import { createAuth, type AuthOptions } from './auth';
import type { Db } from './db/client';
import { registerCalendarRoutes, type CalendarNotify } from './calendar-routes';
import { createPushService, startPushReminders, type PushSend } from './push';
import { registerPushRoutes } from './push-routes';
import { registerFeedRoutes, startFeedPrune } from './feed-routes';
import { Invites, registerInviteRoutes } from './invites';
import { registerSavedGameRoutes } from './saved-games';
import { registerProfileRoutes } from './profile-routes';
import { registerPrizeRoutes } from './prize-routes';
import { registerAdminRoutes } from './admin-routes';
import { attachRecorder } from './recorder';
import { RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';
import { RoomStore, type Located } from './rooms/store';
import { attachSockets } from './socket';
import { registerStickerRoutes } from './sticker-routes';
import { attachLevels } from './levels';
import { attachLikes } from './likes';
import { attachTitles } from './titles';
import { memoryStorage, type ImageStorage } from './storage/images';
import { registerUploadRoutes } from './upload-routes';

export interface AppOptions {
  db: Db;
  auth: AuthOptions;
  scheduler?: Scheduler;
  rng?: () => number;
  /** Куди календар повідомляє про відкриту й скасовану подію (Web Push, підпроєкт 4); типово нікуди. */
  calendarNotify?: CalendarNotify;
  /** Web Push: публічний ключ VAPID і відправник; без нього пуші вимкнені. */
  push?: { publicKey: string; send: PushSend };
  /**
   * Брати адресу клієнта із заголовка X-Forwarded-For (потрібно за проксі, наприклад на Render).
   * Число означає кількість проксі перед сервером; true довіряє заголовку повністю.
   */
  trustProxy?: boolean | number;
  /** Скільки кімнат може існувати одночасно. */
  maxRooms?: number;
  /** Де лежать зображення до запитань; без нього вони живуть у пам'яті процесу. */
  storage?: ImageStorage;
  /** Віддавати малу картинку-фікстуру, коли справжнього файла стікера у сховищі немає (локально й у тестах); типово ні. */
  stickerFixtures?: boolean;
  /** Тека зі зібраним web-клієнтом. */
  webRoot?: string;
  /** Заставки переходів; типово вимкнено, справжній сервер (main.ts) вмикає. */
  transitions?: boolean;
  /** Мінімальний час перед кроками ведучого (11b); типово вимкнено, справжній сервер (main.ts) і наскрізні тести вмикають. */
  pacing?: boolean;
  /** Зберігати живі кімнати в базі й піднімати їх після перезапуску (9b). main.ts і наскрізні тести вмикають. */
  persist?: { instanceId: string; saveDelayMs?: number };
  /** Адреси адмінів (config.adminEmails); типово порожній набір — адмінки немає. */
  adminEmails?: ReadonlySet<string>;
}

const DEFAULT_MAX_ROOMS = 500;
const BODY_LIMIT = 512 * 1024;

export async function buildApp(options: AppOptions) {
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng, { transitions: options.transitions ?? false, pacing: options.pacing ?? false });
  const recorder = attachRecorder(manager, options.db);
  const titles = attachTitles(manager, options.db);
  const levels = attachLevels(manager, options.db);
  const likes = attachLikes(manager, options.db);
  const store = options.persist === undefined ? null : new RoomStore(options.db, manager, options.persist);
  if (store !== null) {
    await store.boot();
    store.start();
  }
  /** Де кімната: тут, у базі за живим іншим процесом (restarting) чи ніде. Збій бази — як перезапуск: клієнт повторить. */
  const locate = async (code: string): Promise<Located> => {
    if (store === null) return manager.get(code) === undefined ? 'none' : 'here';
    try {
      return await store.locate(code);
    } catch (error) {
      console.error('Не вдалося знайти кімнату в базі:', error);
      return 'restarting';
    }
  };
  const RESTARTING = { error: 'restarting' };
  const maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
  // Fastify приймає й кількість проксі; з об'єднаним типом його оголошення вибирають не той вид сервера.
  const trustProxy = (options.trustProxy ?? false) as boolean;
  const app = Fastify({ trustProxy, bodyLimit: BODY_LIMIT });
  if (store !== null) app.addHook('onClose', async () => store.stop());
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  const { currentUser } = await registerAccountRoutes(app, {
    db: options.db,
    auth: createAuth(options.db, options.auth),
    manager,
    locate,
    maxRooms,
    baseURL: options.auth.baseURL,
    attemptsPerMinute: options.auth.attemptsPerMinute ?? 10,
    google: options.auth.google !== undefined,
    adminEmails: options.adminEmails ?? new Set<string>(),
  });

  const imageStorage = options.storage ?? memoryStorage();
  await registerUploadRoutes(app, { storage: imageStorage, currentUser });
  await registerStickerRoutes(app, { storage: imageStorage, fixtures: options.stickerFixtures ?? false });
  await registerProfileRoutes(app, { db: options.db, currentUser });
  await registerPrizeRoutes(app, { db: options.db, manager, locate, currentUser });
  await registerAdminRoutes(app, { db: options.db, manager, adminEmails: options.adminEmails ?? new Set<string>(), currentUser });
  const invites = new Invites(manager);
  await registerInviteRoutes(app, { db: options.db, manager, invites, currentUser });
  await registerFeedRoutes(app, { db: options.db, currentUser });
  const push = options.push === undefined ? null : createPushService({ db: options.db, ...options.push, log: (message, error) => console.error(message, error) });
  const notifiers = [options.calendarNotify, push?.calendarNotify].filter((n): n is CalendarNotify => n !== undefined);
  const calendarNotify: CalendarNotify | undefined =
    notifiers.length === 0
      ? undefined
      : {
          opened: (eventId) => notifiers.forEach((n) => n.opened(eventId)),
          cancelled: (eventId) => notifiers.forEach((n) => n.cancelled(eventId)),
        };
  await registerPushRoutes(app, { db: options.db, service: push, currentUser });
  await registerCalendarRoutes(app, { db: options.db, manager, maxRooms, currentUser, notify: calendarNotify });
  const stopReminders = push === null ? () => undefined : startPushReminders(push, undefined, (error) => console.error('Нагадування не вдалося:', error));
  const stopPrune = startFeedPrune(options.db);
  await registerSavedGameRoutes(app, { db: options.db, manager, locate, currentUser, maxRooms });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code', CODE_LIMIT, async (request, reply) => {
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    return { phase: room.state.phase, title: room.state.quiz.title };
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/join', CODE_LIMIT, async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    // Гравець з акаунтом потрапляє у власну історію ігор; без акаунта чи з простроченою сесією грає як гість.
    const account = await currentUser(request);
    const joined = manager.join(request.params.code, body.data.nickname, account?.id ?? null);
    if (!joined.ok) {
      const status = joined.error === 'game_not_found' ? 404 : joined.error === 'restarting' ? 503 : 409;
      return reply.code(status).send({ error: joined.error });
    }
    return reply.code(201).send({ token: joined.token, playerId: joined.playerId });
  });

  // preCompressed: якщо поруч лежить .br / .gz (збірка кладе їх для мап), віддається він за Accept-Encoding.
  if (options.webRoot !== undefined) await app.register(fastifyStatic, { root: options.webRoot, preCompressed: true });

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

  const io = attachSockets(app.server, manager, locate, { trustProxy: options.trustProxy });
  // Відкриті WebSocket-з'єднання (і довгі опитування) не дали б HTTP-серверу завершитись. io.close()
  // закриває й транспорти engine.io, і рукостискання в польоті; не чекаємо на нього: він сам чекає на
  // закриття HTTP-сервера, яке Fastify зробить після цього хука.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
    void io.close();
  });

  /** Зупинка без втрати ігор: заморозити, сказати клієнтам restarting, записати й віддати кімнати, закрити застосунок, дочекатися записувача. */
  const shutdown = async (): Promise<void> => {
    manager.freeze();
    io.emit('restarting');
    await store?.flushAll({ release: true });
    store?.stop();
    stopPrune();
    stopReminders();
    await app.close();
    await push?.idle();
    await recorder.idle();
    await titles.idle();
    await levels.idle();
    await likes.idle();
  };

  return { app, manager, io, recorder, invites, store, push, shutdown };
}
