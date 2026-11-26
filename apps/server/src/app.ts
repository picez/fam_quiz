import { relative } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { BOT_USER_ID, joinSchema, type CodeInfo } from '@quiz/shared';
import { logAction } from './bans';
import Fastify, { LogController, type FastifyBaseLogger } from 'fastify';
import { CODE_LIMIT, registerAccountRoutes } from './account-routes';
import { createAuth, type AuthOptions } from './auth';
import type { Db } from './db/client';
import { registerCalendarRoutes, type CalendarNotify } from './calendar-routes';
import { createPushService, startPushReminders, type PushSend } from './push';
import { registerPushRoutes } from './push-routes';
import { registerFeedRoutes, startFeedPrune } from './feed-routes';
import { registerGroupRoutes } from './group-routes';
import { registerLibraryRoutes } from './library-routes';
import { registerQuizFolderRoutes } from './quiz-folder-routes';
import { Invites, registerInviteRoutes } from './invites';
import { gateStatus, LobbyGate } from './lobby-access';
import { registerLobbyRoutes } from './lobby-routes';
import { registerSavedGameRoutes } from './saved-games';
import { registerChallengeRoutes } from './challenge-routes';
import { registerProfileRoutes } from './profile-routes';
import { registerActivityRoutes } from './activity-routes';
import { registerProblemRoutes } from './problem-routes';
import { registerInboxRoutes } from './inbox-routes';
import { registerPrizeRoutes } from './prize-routes';
import { registerShowcaseRoutes } from './showcase-routes';
import { registerAdminRoutes } from './admin-routes';
import { isAdmin } from './admin';
import { processStats } from './process-stats';
import { createBotSchedule } from './bot-schedule';
import { announcementCache } from './announcement-store';
import { registerAnnouncementRoutes } from './announcement-routes';
import { attachRecorder } from './recorder';
import { joinableOf, RoomManager } from './rooms/manager';
import { realScheduler, type Scheduler } from './rooms/scheduler';
import { RoomStore, type Located } from './rooms/store';
import { attachSockets } from './socket';
import { cacheControlFor, isMissingFile } from './static-cache';
import { registerStickerRoutes } from './sticker-routes';
import { attachLevels } from './levels';
import { attachLikes } from './likes';
import { attachTitles } from './titles';
import { offlineFetch, type CheckFetch } from './quiz-check';
import { offlineResolve, type CheckResolve } from './url-guard';
import { memoryStorage, type ImageStorage } from './storage/images';
import { registerUploadRoutes } from './upload-routes';
import { registerWordLadderRoutes } from './wordladder-routes';
import { registerLetterWordsRoutes } from './letterwords-routes';
import { lazyNouns, type NounDictionary } from './wordladder/nouns';
import { log, reportError, setErrorSink } from './log';
import { createErrorStore } from './error-store';
import type { DbBackups } from './db-backup';
import type { StoredObject } from './storage/r2-objects';

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
  /** Стиснення кадрів WebSocket (30c); типово увімкнено, false вимикає. */
  socketDeflate?: boolean;
  /** Скільки кімнат може існувати одночасно. */
  maxRooms?: number;
  /** Де лежать зображення до запитань; без нього вони живуть у пам'яті процесу. */
  storage?: ImageStorage;
  /** fetch перевірки вікторини адміном (57); без нього — offlineFetch (мережі немає), справжній передає лише main.ts. */
  checkFetch?: CheckFetch;
  /** DNS перевірки вікторини (57); без нього — offlineResolve, справжній передає лише main.ts. */
  checkResolve?: CheckResolve;
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
  /** Список копій бази в сховищі для блоку «Стан» адмінки; без нього — «сховище не налаштоване». */
  backupList?: () => Promise<StoredObject[]>;
  /** Копія на вимогу (64): лише там, де ввімкнено щотижневі копії; без неї кнопка «Зробити копію зараз» — 503 backup_off. */
  backups?: Pick<DbBackups, 'runNow' | 'status'>;
  /** Словник «Словесної драбини» (26c); типово lazyNouns() — закомічений файл читається при першому слові чи перевірці. */
  nouns?: NounDictionary;
  /** Хвилинний тікер розкладу ігор бота (56); типово вимкнено — тести рухають час викликом botSchedule.tick(). main.ts вмикає. */
  botScheduleTicker?: boolean;
  /** Збої сервера в базу для вкладки «Збої» адмінки (64); типово ввімкнено, false — лише журнал. */
  errorLog?: boolean;
  /** 71: коміт збірки для «Стану» адмінки (RENDER_GIT_COMMIT); без нього — «невідома (локальний запуск)». */
  commit?: string | null;
}

const DEFAULT_MAX_ROOMS = 500;
const BODY_LIMIT = 512 * 1024;

export async function buildApp(options: AppOptions) {
  const nouns = options.nouns ?? lazyNouns();
  const manager = new RoomManager(options.scheduler ?? realScheduler, options.rng, { transitions: options.transitions ?? false, pacing: options.pacing ?? false, nouns });
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
      log.error({ err: error, room: code }, 'Не вдалося знайти кімнату в базі');
      return 'restarting';
    }
  };
  const RESTARTING = { error: 'restarting' };
  const maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
  // Fastify приймає й кількість проксі; з об'єднаним типом його оголошення вибирають не той вид сервера.
  const trustProxy = (options.trustProxy ?? false) as boolean;
  // Журнал (30a): той самий pino, що й у решти сервера (log.ts), рівень з LOG_LEVEL. Запити по одному не журналюються
  // (статика й опитування socket.io засипали б журнал). disableRequestLogging вимикає й власний журнал помилок Fastify,
  // тому 5xx пише хук onError нижче.
  const app = Fastify({ trustProxy, bodyLimit: BODY_LIMIT, loggerInstance: log as FastifyBaseLogger, logController: new LogController({ disableRequestLogging: true }) });
  // Помилки 5xx (30a): у reportError з маршрутом, без IP і тіла запиту; відповідь — звичайна відповідь Fastify на помилку.
  // Хук іде після обробника помилок, тож код відповіді вже стоїть; власні обробники (upload-routes) звітують самі.
  app.addHook('onError', async (request, reply, error) => {
    const status = reply.statusCode >= 400 ? reply.statusCode : ((error as { statusCode?: number }).statusCode ?? 500);
    if (status >= 500) reportError(error, { where: 'http', event: `${request.method} ${request.routeOptions.url ?? 'unknown'}` });
  });
  if (store !== null) app.addHook('onClose', async () => store.stop());
  // Збої в базу (64): другий слот reportError. Знімається в onClose, бо багато тестів кличуть лише app.close().
  const errors = options.errorLog === false ? null : createErrorStore({ db: options.db });
  if (errors !== null) {
    const unsink = setErrorSink(errors.record);
    app.addHook('onClose', async () => {
      unsink();
      await errors.stop();
    });
  }
  await app.register(rateLimit, { global: false });
  // 71: процесор і затримка циклу подій для «Стану» — один знімач на застосунок.
  const stats = processStats();
  app.addHook('onClose', async () => stats.stop());

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
    nouns,
  });

  const imageStorage = options.storage ?? memoryStorage();
  await registerUploadRoutes(app, { storage: imageStorage, currentUser });
  await registerStickerRoutes(app, { storage: imageStorage, fixtures: options.stickerFixtures ?? false });
  await registerProfileRoutes(app, { db: options.db, currentUser });
  await registerActivityRoutes(app, { db: options.db, currentUser });
  await registerPrizeRoutes(app, { db: options.db, manager, locate, currentUser });
  await registerShowcaseRoutes(app, { db: options.db, currentUser });
  const announcements = announcementCache(options.db, () => Date.now());
  await registerProblemRoutes(app, { db: options.db, currentUser, manager });
  await registerInboxRoutes(app, { db: options.db, currentUser });
  await registerAnnouncementRoutes(app, { cache: announcements });
  const push = options.push === undefined ? null : createPushService({ db: options.db, ...options.push, log: (message, error) => log.error({ err: error }, message) });
  await registerAdminRoutes(app, { db: options.db, manager, adminEmails: options.adminEmails ?? new Set<string>(), currentUser, backupList: options.backupList, backups: options.backups, announcements, maxRooms, storage: imageStorage, checkFetch: options.checkFetch ?? offlineFetch, checkResolve: options.checkResolve ?? offlineResolve, push, processStats: stats, commit: options.commit ?? null });
  const invites = new Invites(manager);
  await registerInviteRoutes(app, { db: options.db, manager, invites, currentUser });
  const gate = new LobbyGate(options.db, invites, () => manager.now());
  await registerLobbyRoutes(app, { db: options.db, manager, gate, invites, locate, currentUser });
  await registerFeedRoutes(app, { db: options.db, currentUser });
  await registerGroupRoutes(app, { db: options.db, currentUser });
  await registerLibraryRoutes(app, { db: options.db, currentUser });
  await registerQuizFolderRoutes(app, { db: options.db, currentUser });
  await registerWordLadderRoutes(app, { nouns, currentUser });
  await registerLetterWordsRoutes(app, { nouns, currentUser });
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
  // Розклад ігор бота (56): служба є завжди, тікер — лише з прапорцем.
  const botSchedule = createBotSchedule({ db: options.db, manager, maxRooms, deliver: push === null ? undefined : (userIds, payload) => push.deliver(userIds, payload), scheduler: options.scheduler });
  if (options.botScheduleTicker === true) botSchedule.start();
  app.addHook('onClose', async () => botSchedule.stop());
  const stopReminders = push === null ? () => undefined : startPushReminders(push, undefined, (error) => reportError(error, { where: 'push-reminders' }));
  const stopPrune = startFeedPrune(options.db);
  await registerSavedGameRoutes(app, { db: options.db, manager, locate, currentUser, maxRooms, gate });
  await registerChallengeRoutes(app, { db: options.db, manager, currentUser, maxRooms });

  app.get<{ Params: { code: string } }>('/api/games/by-code/:code', CODE_LIMIT, async (request, reply) => {
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    const room = manager.get(request.params.code);
    const account = await currentUser(request);
    // Спроба виклику (44): чужому й гостю — як невідомий код (кімнати ніби немає); власному гравцеві спроби — як завжди.
    if (room === undefined || (room.challenge !== null && (account === null || ![...room.playerUsers.values()].includes(account.id))))
      return reply.code(404).send({ error: 'game_not_found' });
    // locked — для того, хто питає: ведучий, гравець кімнати, запрошений чи схвалений учасник події входять без пароля. Сам пароль сюди не йде.
    const locked = room.lobby.password !== null && !(await gate.trusted(room, account?.id ?? null));
    const info: CodeInfo = { phase: room.state.phase, title: room.state.quiz.title, locked, late: joinableOf(room) === 'late' };
    return info;
  });

  app.post<{ Params: { code: string } }>('/api/games/by-code/:code/join', CODE_LIMIT, async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    if ((await locate(request.params.code)) === 'restarting') return reply.code(503).send(RESTARTING);
    // Гравець з акаунтом потрапляє у власну історію ігор; без акаунта чи з простроченою сесією грає як гість.
    const account = await currentUser(request);
    const room = manager.get(request.params.code);
    if (room === undefined) return reply.code(404).send({ error: 'game_not_found' });
    // Пароль лобі (24c) — на кожному вході, крім довірених.
    const access = await gate.check(room, { userId: account?.id ?? null, password: body.data.password, ip: request.ip, device: body.data.device });
    if (access !== 'ok') return reply.code(gateStatus(access)).send({ error: access });
    const joined = manager.join(request.params.code, body.data.nickname, account?.id ?? null);
    if (!joined.ok) {
      const status = joined.error === 'game_not_found' ? 404 : joined.error === 'restarting' ? 503 : 409;
      return reply.code(status).send({ error: joined.error });
    }
    return reply.code(201).send({ token: joined.token, playerId: joined.playerId });
  });

  // preCompressed: якщо поруч лежить .br / .gz (збірка кладе їх для мап і для assets/*.js|css), віддається він за
  // Accept-Encoding. Cache-Control ставимо самі (32): рік для хешованих /assets, no-cache для сторінки, воркера й
  // маніфесту, добу для решти. setHeaders отримує шлях обраного файла (з .br / .gz), cacheControlFor це враховує.
  const webRoot = options.webRoot;
  if (webRoot !== undefined)
    await app.register(fastifyStatic, {
      root: webRoot,
      preCompressed: true,
      cacheControl: false,
      setHeaders: (res, path) => res.header('cache-control', cacheControlFor(relative(webRoot, path))),
    });

  app.setNotFoundHandler((request, reply) => {
    const isPage =
      options.webRoot !== undefined &&
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      !request.url.startsWith('/socket.io/');
    // Відсутній файл збірки (старий чанк після деплою) — це 404, а не сторінка: HTML під іменем JS ламає браузер і кеш воркера.
    if (isPage && isMissingFile(request.url)) return reply.code(404).header('cache-control', 'no-store').send({ error: 'not_found' });
    // Маршрути сторінок обробляє клієнт, тому на них віддається та сама сторінка.
    if (isPage) return reply.header('cache-control', 'no-cache').sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });

  const io = attachSockets(app.server, manager, locate, {
    trustProxy: options.trustProxy,
    deflate: options.socketDeflate,
    // 68: дії з пульта адміна в кімнаті бота — у журнал адмінки; збій запису не зачіпає гру.
    onAdminHost: (entry) =>
      void logAction(options.db, {
        adminId: entry.adminId,
        kind: entry.kind,
        targetUserId: BOT_USER_ID,
        details: { title: entry.title, code: entry.code, ...(entry.text === undefined ? {} : { text: entry.text }) },
        now: new Date(),
      }).catch((error: unknown) => reportError(error, { where: 'admin-host-log' })),
    // 68: адміна прибрали (адреса з ADMIN_EMAILS, акаунт видалено чи злито) — його пульти більше не відкриваються.
    adminStill: (adminId) => isAdmin(options.db, options.adminEmails ?? new Set<string>(), adminId),
  });
  // Відкриті WebSocket-з'єднання (і довгі опитування) не дали б HTTP-серверу завершитись. io.close()
  // закриває й транспорти engine.io, і рукостискання в польоті; не чекаємо на нього: він сам чекає на
  // закриття HTTP-сервера, яке Fastify зробить після цього хука.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
    void io.close();
  });

  /** Зупинка без втрати ігор: заморозити, сказати клієнтам restarting, записати й віддати кімнати, закрити застосунок, дочекатися записувача. */
  const shutdown = async (): Promise<void> => {
    botSchedule.stop();
    manager.freeze();
    io.emit('restarting');
    await store?.flushAll({ release: true });
    store?.stop();
    stopPrune();
    stopReminders();
    await app.close();
    await botSchedule.idle();
    await push?.idle();
    await recorder.idle();
    await titles.idle();
    await levels.idle();
    await likes.idle();
  };

  return { app, manager, io, recorder, invites, store, push, botSchedule, errors, shutdown };
}
