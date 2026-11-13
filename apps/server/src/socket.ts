import type { Server as HttpServer } from 'node:http';
import {
  adjustSchema,
  undoSchema,
  answerSchema,
  buyDebuffSchema,
  debuffSchema,
  declareSchema,
  duelAnswerSchema,
  duelPickSchema,
  guessSchema,
  judgeSchema,
  kickSchema,
  nameSchema,
  orderSchema,
  overrideSchema,
  pendingSchema,
  pickSchema,
  wagerSchema,
  socketAuthSchema,
  sortSchema,
  sortTiltSchema,
  wallSchema,
  lieSchema,
  bluffOptionSchema,
  wipeoutSchema,
  lifelineSchema,
  ladderDecideSchema,
  ladderPickSchema,
  trialSchema,
  doorSchema,
  cloudHideSchema,
  buffSchema,
  hintSchema,
  voteSchema,
  retrySchema,
  audioCommandSchema,
  timeSchema,
  undebuffSchema,
  teamPickSchema,
  truthFactSchema,
  truthHideSchema,
  duelistSchema,
  pickAnswererSchema,
  draftSchema,
  awaySchema,
  appealSchema,
  appealVoteSchema,
  teamFormSchema,
  teamAssignSchema,
  captainSchema,
  liveWatchSchema,
  startSchema,
  reactSchema,
  likeSchema,
  perkSchema,
  wordLadderWordSchema,
  timedListWordSchema,
  letterWordSchema,
  moreLessPickSchema,
  jigsawHoldSchema,
  jigsawPlaceSchema,
  spotdiffTapSchema,
  melodyOpenSchema,
  questCodeSchema,
  memoryFlipSchema,
  puzzleDoneSchema,
  puzzleFillSchema,
  drawGuessSchema,
  drawOpSchema,
  DRAW_SYNC_PER_SECOND,
  HOST_DRAFTS_MS,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SortTilt,
} from '@quiz/shared';
import { teamOf } from '@quiz/engine';
import type { HostAction } from './rooms/manager';
import { Server, type Socket } from 'socket.io';
import type { Identity, Room, RoomManager } from './rooms/manager';
import type { Located } from './rooms/store';
import { guarded, reportError } from './log';

interface SocketData {
  room: Room;
  identity: Identity;
  /** Пульт: увімкнено «наживо» (12b); типово false — веб оголошує свій вибір одразу після підключення. */
  watch: boolean;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Формат коду кімнати (RoomManager видає шість цифр). */
const ROOM_CODE = /^\d{6}$/;
const FORBIDDEN: AckResult = { ok: false, error: 'forbidden' };
const NOT_ALLOWED: AckResult = { ok: false, error: 'not_allowed' };
const INVALID: AckResult = { ok: false, error: 'invalid_payload' };
/** Обробник події впав (30a): дію не виконано, стан кімнати — той, що був до неї. */
const INTERNAL: AckResult = { ok: false, error: 'internal' };
/** Загальний ліміт сокета вичерпано (30a); окремо від too_soon спецлімітів і темпу гри. */
const RATE_LIMITED: AckResult = { ok: false, error: 'rate_limited' };
/**
 * Загальний ліміт подій одного сокета (30a): не більше стількох за вікно 1000 мс; понад — rate_limited без виклику обробника й без розсилки.
 * Чесний телефон шле кілька подій на секунду; спецліміти подій (чернетки, «Пазл», «Пам'ять», …) лишаються своїми й суворішими.
 */
export const SOCKET_EVENTS_PER_SECOND = 20;
/**
 * Потоки, що законно частіші за загальний ліміт і мають власний дросель на сервері: операції художника (DRAW_OPS_PER_SECOND = 25)
 * і нахил картки сортування (SORT_TILT_GAP_MS = 80 мс). У загальне вікно вони не рахуються.
 */
const UNCOUNTED_EVENTS: ReadonlySet<string> = new Set(['player:draw', 'player:sort-tilt']);
/**
 * Найбільше повідомлення від клієнта (30a; maxHttpBufferSize socket.io, типово 1 МБ). Найбільша законна подія — операція художника
 * «Малюнка» (28c): до LIMITS.drawBatch = 64 точок, тобто 128 чисел до 1000, менше 1 КБ; решта подій — кілька сотень байтів.
 * 64 КБ — із запасом у десятки разів; довше повідомлення socket.io відкидає й закриває з'єднання (клієнт перепідключиться).
 */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** Скільки разів за хвилину одна адреса може питати базу про код, якого немає в пам'яті. */
export const LOOKUPS_PER_MINUTE = 60;
const LOOKUP_WINDOW_MS = 60_000;
const SIMPLE_HOST_ACTIONS = ['lock', 'next', 'pause', 'resume', 'end-round', 'end', 'save', 'dice', 'roll', 'skip', 'duel-skip', 'duel-cancel', 'guide-skip', 'clue', 'survey-all', 'bluff-all', 'team-deal', 'team-dice', 'team-roll'] as const;

/** Клієнт міг не передати функцію підтвердження або передати на її місці що завгодно. */
function reply(args: unknown[], result: AckResult): void {
  const ack = args.at(-1);
  if (typeof ack !== 'function') return;
  try {
    ack(result);
  } catch (error) {
    reportError(error, { where: 'socket-ack' });
  }
}

/**
 * Нахил — лише там, де сортує одна сторона (11d): на полі — усім, крім автора; у команді — його команді й пульту.
 * Пульт отримує нахил лише з увімкненим «наживо» (12b).
 */
function seesTilt(socket: GameSocket, room: Room, tilt: { tilt: SortTilt; by: string; audience: 'all' | 'team' }): boolean {
  const { role, playerId } = socket.data.identity;
  if (role === 'host') return socket.data.watch;
  if (playerId !== null && playerId === tilt.by) return false;
  if (tilt.audience === 'all') return true;
  return role === 'player' && playerId !== null && teamOf(room.state, playerId) === tilt.tilt.sorterId;
}

/** Перший аргумент події, якщо це дані, а не функція підтвердження. */
function payloadOf(args: unknown[]): unknown {
  return typeof args[0] === 'function' ? undefined : args[0];
}

export interface SocketOptions {
  /** Як у Fastify: true — довіряти X-Forwarded-For повністю, число — кількість проксі перед сервером. */
  trustProxy?: boolean | number;
  lookupsPerMinute?: number;
  /** Найкоротша пауза між пакетами host:drafts (12b); типово HOST_DRAFTS_MS. */
  draftsGapMs?: number;
  /** Найкоротша пауза між зрізами кімнати від пакетів клітинок «Головоломок» (28d); типово PUZZLE_PUSH_MS. */
  puzzleGapMs?: number;
  /** Загальний ліміт подій сокета за секунду (30a); типово SOCKET_EVENTS_PER_SECOND. */
  eventsPerSecond?: number;
}

/** Вікно злиття зрізів від пакетів клітинок (28d): телефон шле пакет раз на 250 мс, тож на кімнату — не частіше. */
export const PUZZLE_PUSH_MS = 250;

/** Адреса клієнта за тими самими правилами, що й request.ip у Fastify (proxy-addr). */
export function clientAddress(socket: { handshake: { address: string; headers: Record<string, string | string[] | undefined> } }, trust: boolean | number): string {
  const header = socket.handshake.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (trust === false || trust === 0 || forwarded.length === 0) return socket.handshake.address;
  if (trust === true) return forwarded[0];
  const chain = [socket.handshake.address, ...forwarded.reverse()];
  return chain[Math.min(trust, chain.length - 1)];
}

/** locate — де кімната: у пам'яті (або щойно піднята з бази), за живим іншим процесом (restarting) чи ніде. */
export function attachSockets(
  server: HttpServer,
  manager: RoomManager,
  locate: (code: string) => Promise<Located>,
  options: SocketOptions = {},
): GameServer {
  const io: GameServer = new Server(server, { serveClient: false, maxHttpBufferSize: MAX_MESSAGE_BYTES });
  const perSecond = options.eventsPerSecond ?? SOCKET_EVENTS_PER_SECOND;
  /**
   * Сокети кімнати (30a): локальний покажчик замість перебору всіх сокетів процесу на кожну розсилку. Сокет потрапляє сюди,
   * лише коли з'єднання прийнято (connection), і виходить на disconnect; кімната сокета не змінюється.
   */
  const byRoom = new Map<Room, Set<GameSocket>>();
  /** Знімок: розсилка може розірвати з'єднання (disconnect змінює покажчик посеред перебору). */
  const roomSockets = (room: Room): GameSocket[] => [...(byRoom.get(room) ?? [])];
  const trust = options.trustProxy ?? false;
  const allowed = options.lookupsPerMinute ?? LOOKUPS_PER_MINUTE;
  /** Пошуки в базі за адресою у поточному вікні; вікно спливає — лічильник з нуля. */
  const lookups = new Map<string, { count: number; until: number }>();
  const mayLookUp = (address: string): boolean => {
    const now = Date.now();
    if (lookups.size > 10_000) for (const [key, value] of lookups) if (value.until <= now) lookups.delete(key);
    const current = lookups.get(address);
    if (current === undefined || current.until <= now) {
      lookups.set(address, { count: 1, until: now + LOOKUP_WINDOW_MS });
      return true;
    }
    current.count += 1;
    return current.count <= allowed;
  };

  io.use(async (socket, next) => {
    try {
      await handshake(socket, next);
    } catch (error) {
      // Збій під час рукостискання (30a): клієнт перепідключиться пізніше, процес живий.
      reportError(error, { where: 'socket-handshake' });
      next(new Error('restarting'));
    }
  });

  async function handshake(socket: GameSocket, next: (error?: Error) => void): Promise<void> {
    const auth = socketAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error('unauthorized'));
    // Коди кімнат — шість цифр: інший рядок не існує, і базу за ним не питаємо.
    if (!ROOM_CODE.test(auth.data.code)) return next(new Error('unauthorized'));
    // Кімнату ще веде стара версія (розгортання) або сервер зупиняється: клієнт перепідключиться пізніше.
    if (manager.frozen) return next(new Error('restarting'));
    // Коду немає в пам'яті — питаємо базу, але не частіше за ліміт з однієї адреси: перебір кодів
    // інакше бив би в базу. Понад ліміт — restarting: справжній клієнт просто повторить згодом.
    if (manager.get(auth.data.code) === undefined && !mayLookUp(clientAddress(socket, trust))) {
      return next(new Error('restarting'));
    }
    const located = await locate(auth.data.code);
    // Поки чекали на базу, сервер міг почати зупинку.
    if (manager.frozen || located === 'restarting') return next(new Error('restarting'));
    const found = manager.identify(auth.data.code, auth.data.role, auth.data.token);
    if (found === null) return next(new Error('unauthorized'));
    socket.data.room = found.room;
    socket.data.identity = found.identity;
    next();
  }

  /** Зріз одному сокету; збій зрізу (30a) — у журнал, а розсилка іде далі іншим сокетам. */
  const push = (socket: GameSocket) => {
    const { room, identity } = socket.data;
    try {
      const view = manager.view(room, identity);
      if (view !== null) {
        socket.emit('state', view, {
          serverNow: manager.now(),
          hostOnline: manager.hostOnline(room),
          stageOnline: manager.stageOnline(room),
        });
      }
    } catch (error) {
      reportError(error, { where: 'socket-push', room: room.code, role: identity.role });
    }
  };

  const gap = options.draftsGapMs ?? HOST_DRAFTS_MS;
  /** Пакети живих виборів (12b) за кімнатою: мить останнього й таймер наступного. */
  const batches = new Map<Room, { last: number; timer: ReturnType<typeof setTimeout> | null }>();
  const watchers = (room: Room) => roomSockets(room).filter((s) => s.data.identity.role === 'host' && s.data.watch);
  const flushDrafts = (room: Room, to: GameSocket[]) => {
    const batch = manager.liveDrafts(room);
    for (const s of to) s.emit('host:drafts', batch);
  };
  const dropDrafts = (room: Room) => {
    const entry = batches.get(room);
    if (entry?.timer) clearTimeout(entry.timer);
    batches.delete(room);
  };
  /** Перший пакет — одразу, далі — не частіше ніж раз на gap: у кінці вікна з найсвіжішим знімком. */
  const scheduleDrafts = (room: Room) => {
    const entry = batches.get(room) ?? { last: -Infinity, timer: null };
    if (entry.timer !== null) return;
    const to = watchers(room);
    if (to.length === 0) return;
    batches.set(room, entry);
    const wait = entry.last + gap - Date.now();
    if (wait <= 0) {
      entry.last = Date.now();
      flushDrafts(room, to);
      return;
    }
    entry.timer = setTimeout(
      guarded({ where: 'socket-timer', room: room.code, what: 'drafts' }, () => {
        entry.timer = null;
        if (manager.get(room.code) !== room) return dropDrafts(room);
        const later = watchers(room);
        if (later.length === 0) return;
        entry.last = Date.now();
        flushDrafts(room, later);
      }),
      wait,
    );
  };

  const puzzleGap = options.puzzleGapMs ?? PUZZLE_PUSH_MS;
  /** Зрізи від пакетів клітинок (28d) за кімнатою: мить останньої розсилки й таймер замикальної. */
  const puzzlePushes = new Map<Room, { last: number; timer: ReturnType<typeof setTimeout> | null }>();
  const dropPuzzle = (room: Room) => {
    const entry = puzzlePushes.get(room);
    if (entry?.timer) clearTimeout(entry.timer);
    puzzlePushes.delete(room);
  };
  /** Будь-яка інша зміна йде одразу й несе найсвіжіший стан — відкладений зріз уже не потрібен. */
  const pushedNow = (room: Room) => {
    const entry = puzzlePushes.get(room);
    if (entry === undefined) return;
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
    entry.last = Date.now();
  };
  /** Перший зріз — одразу, далі — не частіше ніж раз на puzzleGap: у кінці вікна з найсвіжішим станом. */
  const schedulePuzzle = (room: Room) => {
    const entry = puzzlePushes.get(room) ?? { last: -Infinity, timer: null };
    puzzlePushes.set(room, entry);
    if (entry.timer !== null) return;
    const wait = entry.last + puzzleGap - Date.now();
    if (wait <= 0) {
      entry.last = Date.now();
      roomSockets(room).forEach(push);
      scheduleDrafts(room);
      return;
    }
    entry.timer = setTimeout(
      guarded({ where: 'socket-timer', room: room.code, what: 'puzzle' }, () => {
        entry.timer = null;
        if (manager.get(room.code) !== room) return dropPuzzle(room);
        entry.last = Date.now();
        roomSockets(room).forEach(push);
        scheduleDrafts(room);
      }),
      wait,
    );
  };

  manager.onEvent((room, event) => {
    if (event.type === 'draft') {
      // Чернетка капітана — решті команди автора зрізом (10j): ні автору, ні сцені, ні іншим командам.
      // Соло-чернетка нікому, крім пульта, — без перебору сокетів.
      if (event.teammates) {
        roomSockets(room)
          .filter((socket) => {
            const { role, playerId } = socket.data.identity;
            return role === 'player' && playerId !== null && playerId !== event.by && teamOf(room.state, playerId) === event.id;
          })
          .forEach(push);
      }
      // Пульту — лише пакет host:drafts і лише з «наживо» (12b).
      scheduleDrafts(room);
      return;
    }
    // Лайк (17a) — справа attachLikes; телефони дізнаються з наступного changed. Без перебору сокетів.
    if (event.type === 'like') return;
    const members = roomSockets(room);
    if (event.type === 'changed') {
      if (event.puzzle === true) {
        // Пакет клітинок (28d): ack уже синхронний, тож зрізи кімнати зливаються в замикальному вікні.
        schedulePuzzle(room);
        return;
      }
      if (event.only !== undefined) {
        // 29h: зміну бачить лише власник (гравець чи його команда): ні сцена, ні пульт, ні інші телефони кадру не дістають.
        const { only } = event;
        members
          .filter((s) => s.data.identity.role === 'player' && s.data.identity.playerId !== null && (s.data.identity.playerId === only || teamOf(room.state, s.data.identity.playerId) === only))
          .forEach(push);
        return;
      }
      pushedNow(room);
      members.forEach(push);
      // Стан змінився — чернетка могла застаріти: пульт отримує свіжий пакет.
      scheduleDrafts(room);
      return;
    }
    if (event.type === 'tilt') {
      members.filter((socket) => seesTilt(socket, room, event)).forEach((socket) => socket.emit('sort:tilt', event.tilt));
      return;
    }
    if (event.type === 'drawing') {
      // Малюнок (28c) бачать усі ролі кімнати: сцена, пульт, вгадувачі й сам художник (свої операції телефон пропускає). Слова подія не несе.
      members.forEach((socket) => socket.emit('drawing', event.event));
      return;
    }
    if (event.type === 'audio') {
      // Звук знає лише сцена й пульт: телефони не отримують ні команди, ні джерела.
      members
        .filter((socket) => socket.data.identity.role !== 'player')
        .forEach((socket) => socket.emit('audio', { action: event.action, seq: event.seq }));
      return;
    }
    if (event.type === 'reaction') {
      members.forEach((socket) => socket.emit('reaction', event.reaction));
      return;
    }
    if (event.type === 'awards') {
      // Карусель нагород живе на сцені: телефони й пульт дотику не отримують.
      members.filter((socket) => socket.data.identity.role === 'stage').forEach((socket) => socket.emit('awards', { seq: event.seq }));
      return;
    }
    if (event.type === 'moved') {
      dropDrafts(room);
      dropPuzzle(room);
      // Кімнату веде інший процес: перепідключитися з тим самим токеном.
      for (const socket of members) {
        socket.emit('restarting');
        socket.disconnect(true);
      }
      return;
    }
    // Далі — лише закриття кімнати й вилучення гравця: будь-яка інша подія не має права розірвати кімнату.
    if (event.type !== 'closed' && event.type !== 'kicked') {
      const never: never = event;
      void never;
      return;
    }
    if (event.type === 'closed') {
      dropDrafts(room);
      dropPuzzle(room);
    }
    const leaving =
      event.type === 'kicked' ? members.filter((s) => s.data.identity.playerId === event.playerId) : members;
    const reason = event.type === 'kicked' ? (event.reason ?? 'kicked') : event.saved !== undefined ? 'saved' : 'expired';
    for (const socket of leaving) {
      socket.emit('closed', reason);
      // Збереження (13b) закриває кімнату посеред обробника host:save: розрив — після ack, інакше відповідь не дійде.
      if (reason === 'saved') setImmediate(() => socket.disconnect(true));
      else socket.disconnect(true);
    }
  });

  io.on('connection', (socket) => {
    const { room, identity } = socket.data;
    // Між рукостисканням і з'єднанням кімнату могли закрити чи віддати, а сервер — почати зупинку:
    // клієнт перепідключиться й дізнається, що з грою.
    if (manager.frozen || manager.get(room.code) !== room) {
      socket.emit('restarting');
      socket.disconnect(true);
      return;
    }
    socket.data.watch = false;
    const joined = byRoom.get(room) ?? new Set<GameSocket>();
    byRoom.set(room, joined);
    joined.add(socket);
    const context = { where: 'socket', room: room.code, role: identity.role };
    socket.on('disconnect', () => {
      joined.delete(socket);
      if (joined.size === 0 && byRoom.get(room) === joined) byRoom.delete(room);
      try {
        manager.guard(room, () => manager.disconnect(room, identity));
      } catch (error) {
        reportError(error, { ...context, event: 'disconnect' });
      }
    });
    try {
      manager.guard(room, () => manager.connect(room, identity));
      // Малюнок (28c): зрізи несуть лише метадані, тож щойно підключений (і перепідключений) отримує всі штрихи одразу —
      // раніше за перший зріз: клієнт зі скинутою моделлю, побачивши в зрізі rev, інакше попросив би draw:sync удруге.
      const sketch = manager.drawSnapshot(room);
      if (sketch !== null) socket.emit('drawing', sketch);
      push(socket);
      // Щойно підключений бачить і нахил, що вже діє: палець може стояти, тож нового нахилу не буде (пульт — лише з «наживо»).
      for (const tilt of manager.liveTilts(room)) if (seesTilt(socket, room, tilt)) socket.emit('sort:tilt', tilt.tilt);
    } catch (error) {
      reportError(error, { ...context, event: 'connect' });
    }

    /** Загальне вікно частоти сокета (30a): початок і кількість подій у ньому. */
    let budget = { from: -Infinity, count: 0 };
    const withinBudget = (event: string): boolean => {
      if (UNCOUNTED_EVENTS.has(event)) return true;
      const now = Date.now();
      if (now - budget.from >= 1000) budget = { from: now, count: 0 };
      if (budget.count >= perSecond) return false;
      budget.count += 1;
      return true;
    };

    // Обробники приймають довільні аргументи: типи подій описують чесного клієнта, а не будь-якого.
    // Обгортка (30a): спершу загальний ліміт сокета, потім обробник; виняток обробника — у журнал і ack internal, а не вгору
    // (там він поклав би процес). Стан кімнати manager.guard повертає до знімка перед дією.
    const on = (event: keyof ClientToServerEvents, handler: (args: unknown[]) => AckResult) => {
      (socket as unknown as { on(event: string, listener: (...args: unknown[]) => void): void }).on(event, (...args) => {
        if (!withinBudget(event)) return reply(args, RATE_LIMITED);
        let result: AckResult;
        try {
          // Відкат (manager.guard): збій посеред дії не лишає нового стану без розсилки й запису, а клієнт бачить «не виконано».
          result = manager.guard(room, () => handler(args));
        } catch (error) {
          reportError(error, { ...context, event });
          result = INTERNAL;
        }
        reply(args, result);
      });
    };
    const isHost = identity.role === 'host';
    // Хто доходить до обробників host:*: пульт; у грі без ведучого — і гравець (manager.author відповідає not_allowed чужим і зайвим діям).
    const hostSide = isHost || (identity.role === 'player' && identity.playerId !== null && room.state.autopilot !== undefined);
    const run = (action: HostAction): AckResult => (isHost ? manager.host(room, action) : manager.author(room, identity.playerId!, action));

    on('player:answer', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const answer = answerSchema.safeParse(payloadOf(args));
      return answer.success ? manager.answer(room, identity.playerId, answer.data) : INVALID;
    });

    on('player:buzz', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.buzz(room, identity.playerId);
    });

    on('player:guess', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = guessSchema.safeParse(payloadOf(args));
      return payload.success ? manager.guess(room, identity.playerId, payload.data.word) : INVALID;
    });

    on('player:wordladder', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = wordLadderWordSchema.safeParse(payloadOf(args));
      return payload.success ? manager.wordLadderWord(room, identity.playerId, payload.data.word) : INVALID;
    });

    on('player:wordladder-back', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.wordLadderBack(room, identity.playerId);
    });

    on('player:list', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = timedListWordSchema.safeParse(payloadOf(args));
      return payload.success ? manager.timedList(room, identity.playerId, payload.data.word, payload.data.enter) : INVALID;
    });

    on('player:letters', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = letterWordSchema.safeParse(payloadOf(args));
      return payload.success ? manager.letterWord(room, identity.playerId, payload.data.word) : INVALID;
    });

    on('player:moreless', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = moreLessPickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.moreLess(room, identity.playerId, payload.data.index, payload.data.pick) : INVALID;
    });

    // «Головоломки» (28d): ack лише { ok: true } чи відмова — однаковий для правильної й хибної цифри (літери) і сітки.
    on('player:puzzle', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = puzzleFillSchema.safeParse(payloadOf(args));
      return payload.success ? manager.puzzleFill(room, identity.playerId, payload.data.questionIndex, payload.data.cells) : INVALID;
    });

    on('player:puzzle-done', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = puzzleDoneSchema.safeParse(payloadOf(args));
      return payload.success ? manager.puzzleDone(room, identity.playerId, payload.data.questionIndex) : INVALID;
    });

    // «Пазл» (29c): ack лише { ok: true } чи помилка; номер запитання — в межах раунду, як у зрізі.
    on('player:jigsaw', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = jigsawPlaceSchema.safeParse(payloadOf(args));
      return payload.success ? manager.jigsawPlace(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:jigsaw-hold', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = jigsawHoldSchema.safeParse(payloadOf(args));
      return payload.success ? manager.jigsawHold(room, identity.playerId, payload.data) : INVALID;
    });

    // «Знайди відмінності» (29d): ack { ok: true } на влучання, spotdiff_miss / spotdiff_freeze на промах; номер запитання — в межах раунду.
    on('player:spotdiff', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = spotdiffTapSchema.safeParse(payloadOf(args));
      return payload.success ? manager.spotdiffTap(room, identity.playerId, payload.data) : INVALID;
    });

    // «Пам'ять» (29f): ack { ok: true } на будь-яке прийняте відкриття; вміст картки — лише зрізом; номер запитання — в межах раунду.
    on('player:memory', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = memoryFlipSchema.safeParse(payloadOf(args));
      return payload.success ? manager.memoryFlip(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:melody', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = melodyOpenSchema.safeParse(payloadOf(args));
      return payload.success ? manager.melodyOpen(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:quest', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = questCodeSchema.safeParse(payloadOf(args));
      return payload.success ? manager.questCode(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:draw', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = drawOpSchema.safeParse(payloadOf(args));
      return payload.success ? manager.draw(room, identity.playerId, payload.data) : INVALID;
    });

    // Ack лише «вгадано» чи відмова (drawing_miss однаковий для будь-якого хибного слова).
    on('player:draw-guess', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = drawGuessSchema.safeParse(payloadOf(args));
      return payload.success ? manager.drawGuess(room, identity.playerId, payload.data.text) : INVALID;
    });

    // Будь-яка роль: клієнт бачить, що відстав (view.drawing.rev більший за свій), і просить повний малюнок. Вікно — на сокет.
    let syncWindow = { from: -Infinity, count: 0 };
    on('draw:sync', () => {
      const now = Date.now();
      if (now - syncWindow.from >= 1000) syncWindow = { from: now, count: 0 };
      if (syncWindow.count >= DRAW_SYNC_PER_SECOND) return { ok: false, error: 'too_soon' };
      syncWindow.count += 1;
      const snap = manager.drawSnapshot(room);
      if (snap === null) return { ok: false, error: 'type_mismatch' };
      socket.emit('drawing', snap);
      return { ok: true };
    });

    on('player:sort', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = sortSchema.safeParse(payloadOf(args));
      return payload.success ? manager.sort(room, identity.playerId, payload.data.wordId, payload.data.categoryId) : INVALID;
    });

    on('player:sort-tilt', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = sortTiltSchema.safeParse(payloadOf(args));
      return payload.success ? manager.tilt(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:wall', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = wallSchema.safeParse(payloadOf(args));
      return payload.success ? manager.wall(room, identity.playerId, payload.data.tiles) : INVALID;
    });

    on('player:lie', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = lieSchema.safeParse(payloadOf(args));
      return payload.success ? manager.lie(room, identity.playerId, payload.data.text) : INVALID;
    });

    on('player:bluff', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = bluffOptionSchema.safeParse(payloadOf(args));
      return payload.success ? manager.bluff(room, identity.playerId, payload.data.optionId) : INVALID;
    });

    on('player:wipeout', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = wipeoutSchema.safeParse(payloadOf(args));
      return payload.success ? manager.wipeout(room, identity.playerId, payload.data.take) : INVALID;
    });

    on('player:lifeline', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = lifelineSchema.safeParse(payloadOf(args));
      return payload.success ? manager.lifeline(room, identity.playerId, payload.data.kind) : INVALID;
    });

    on('player:ladder', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = ladderDecideSchema.safeParse(payloadOf(args));
      return payload.success ? manager.ladderDecide(room, identity.playerId, payload.data.take) : INVALID;
    });

    on('player:trial', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = trialSchema.safeParse(payloadOf(args));
      return payload.success ? manager.trial(room, identity.playerId, payload.data.answer) : INVALID;
    });

    on('player:door', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = doorSchema.safeParse(payloadOf(args));
      return payload.success ? manager.door(room, identity.playerId, payload.data.door) : INVALID;
    });

    on('player:buff', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = buffSchema.safeParse(payloadOf(args));
      return payload.success ? manager.buff(room, identity.playerId, payload.data.kind, payload.data.targetId) : INVALID;
    });

    on('player:debuff', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = buyDebuffSchema.safeParse(payloadOf(args));
      return payload.success ? manager.buyDebuff(room, identity.playerId, payload.data.targetId, payload.data.kind) : INVALID;
    });

    on('player:vote', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = voteSchema.safeParse(payloadOf(args));
      return payload.success ? manager.vote(room, identity.playerId, payload.data.askerId, payload.data.answer) : INVALID;
    });

    on('player:react', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = reactSchema.safeParse(payloadOf(args));
      return payload.success ? manager.react(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:like', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = likeSchema.safeParse(payloadOf(args));
      return payload.success ? manager.like(room, identity.playerId, payload.data) : INVALID;
    });

    on('player:perk', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = perkSchema.safeParse(payloadOf(args));
      return payload.success ? manager.usePerk(room, identity.playerId, payload.data.kind) : INVALID;
    });

    on('host:react', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = reactSchema.safeParse(payloadOf(args));
      return payload.success ? manager.react(room, 'host', payload.data) : INVALID;
    });

    on('player:appeal', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = appealSchema.safeParse(payloadOf(args));
      return payload.success ? manager.appeal(room, identity.playerId, payload.data.reason) : INVALID;
    });

    on('player:appeal-vote', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = appealVoteSchema.safeParse(payloadOf(args));
      return payload.success ? manager.appealVote(room, identity.playerId, payload.data.appealId, payload.data.yes) : INVALID;
    });

    on('player:retry', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = retrySchema.safeParse(payloadOf(args));
      return payload.success ? manager.retry(room, identity.playerId, payload.data.keep) : INVALID;
    });

    on('player:duel', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = declareSchema.safeParse(payloadOf(args));
      return payload.success ? manager.declareDuel(room, identity.playerId, payload.data.opponentId) : INVALID;
    });

    on('player:duel-category', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = duelPickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.duelCategory(room, identity.playerId, payload.data.categoryId) : INVALID;
    });

    on('player:duel-answer', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = duelAnswerSchema.safeParse(payloadOf(args));
      return payload.success ? manager.duelAnswer(room, identity.playerId, payload.data.text) : INVALID;
    });

    on('player:hint', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.hint(room, identity.playerId);
    });

    on('player:clue', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.clue(room, identity.playerId);
    });

    on('player:pick', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = pickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.pick(room, identity.playerId, payload.data.cellId) : INVALID;
    });

    on('player:roll', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.roll(room, identity.playerId);
    });

    on('player:wager', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = wagerSchema.safeParse(payloadOf(args));
      return payload.success ? manager.wager(room, identity.playerId, payload.data.amount, payload.data.allIn ?? false) : INVALID;
    });

    on('player:team', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = teamPickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.teamPick(room, identity.playerId, payload.data.teamId) : INVALID;
    });

    // «Правда про гравця» (28b): факт про себе; ack без тексту.
    on('player:truth', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = truthFactSchema.safeParse(payloadOf(args));
      return payload.success ? manager.truth(room, identity.playerId, payload.data.text) : INVALID;
    });

    on('player:team-roll', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.teamRoll(room, identity.playerId);
    });

    on('player:duelist', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = duelistSchema.safeParse(payloadOf(args));
      return payload.success ? manager.duelist(room, identity.playerId, payload.data.memberId) : INVALID;
    });

    // Подія від гравця (12g): у грі без ведучого автор діє як звичайний гравець — капітан своєї команди.
    on('player:pick-answerer', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = pickAnswererSchema.safeParse(payloadOf(args));
      return payload.success ? manager.pickAnswerer(room, identity.playerId, payload.data.memberId, payload.data.scope) : INVALID;
    });

    on('player:draft', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = draftSchema.safeParse(payloadOf(args));
      return payload.success ? manager.draft(room, identity.playerId, payload.data.draft) : INVALID;
    });

    on('player:away', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = awaySchema.safeParse(payloadOf(args));
      if (!payload.success) return INVALID;
      const { away, ms, sinceReturnMs } = payload.data;
      return manager.away(room, identity.playerId, away, { ms, sinceReturnMs });
    });

    on('host:live-watch', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = liveWatchSchema.safeParse(payloadOf(args));
      if (!payload.success) return INVALID;
      socket.data.watch = payload.data.on;
      if (payload.data.on) {
        socket.emit('host:drafts', manager.liveDrafts(room));
        // Негайний пакет теж рахується: наступний — не раніше ніж за gap.
        const entry = batches.get(room) ?? { last: -Infinity, timer: null };
        entry.last = Date.now();
        batches.set(room, entry);
        for (const tilt of manager.liveTilts(room)) if (seesTilt(socket, room, tilt)) socket.emit('sort:tilt', tilt.tilt);
      }
      return { ok: true };
    });

    // Без даних (чи null: undefined у масиві аргументів доходить як null) — звичайний старт; resume — продовжити гру (12r).
    on('host:start', (args) => {
      if (!hostSide) return FORBIDDEN;
      const raw = payloadOf(args);
      if (raw === undefined || raw === null) return run({ type: 'start' });
      const payload = startSchema.safeParse(raw);
      if (!payload.success) return INVALID;
      return run(payload.data.resume === undefined ? { type: 'start' } : { type: 'start', resume: payload.data.resume });
    });

    for (const type of SIMPLE_HOST_ACTIONS) {
      on(`host:${type}`, () => (hostSide ? run({ type }) : FORBIDDEN));
    }

    on('host:override', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = overrideSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'override', ...payload.data }) : INVALID;
    });

    on('host:pick', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = pickSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'pick', ...payload.data }) : INVALID;
    });

    on('host:duel-category', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = duelPickSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'duel-category', ...payload.data }) : INVALID;
    });

    on('host:order', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = orderSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'order', ...payload.data }) : INVALID;
    });

    on('host:cloud-hide', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = cloudHideSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'cloud-hide', ...payload.data }) : INVALID;
    });

    on('host:bluff-remove', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = bluffOptionSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'bluff-remove', ...payload.data }) : INVALID;
    });

    on('host:kick', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = kickSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'kick', ...payload.data }) : INVALID;
    });

    // Звільнити місце збереженої гри (13b): та сама форма, що й host:kick.
    on('host:release', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = kickSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'release', ...payload.data }) : INVALID;
    });

    on('host:adjust', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = adjustSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'adjust', ...payload.data }) : INVALID;
    });

    on('host:undo', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = undoSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'undo', target: payload.data.target }) : INVALID;
    });

    on('host:hint', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = hintSchema.safeParse(payloadOf(args));
      return payload.success ? (isHost ? manager.hostHint(room, payload.data.playerId, payload.data.text) : NOT_ALLOWED) : INVALID;
    });

    on('host:ladder-pick', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = ladderPickSchema.safeParse(payloadOf(args));
      return payload.success ? (isHost ? manager.hostLadderPick(room, payload.data.playerId) : NOT_ALLOWED) : INVALID;
    });

    on('host:ladder-decide', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = ladderDecideSchema.safeParse(payloadOf(args));
      return payload.success ? (isHost ? manager.hostLadderDecide(room, payload.data.take) : NOT_ALLOWED) : INVALID;
    });

    on('host:debuff', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = debuffSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'debuff', ...payload.data }) : INVALID;
    });

    on('host:undebuff', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = undebuffSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'undebuff', ...payload.data }) : INVALID;
    });

    on('host:judge', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = judgeSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'judge', ...payload.data }) : INVALID;
    });

    on('host:name', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = nameSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'name', ...payload.data }) : INVALID;
    });

    for (const type of ['accept', 'repick'] as const) {
      on(`host:${type}`, (args) => {
        if (!hostSide) return FORBIDDEN;
        const payload = pendingSchema.safeParse(payloadOf(args));
        return payload.success ? run({ type, ...payload.data }) : INVALID;
      });
    }

    on('host:team-form', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = teamFormSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'team-form', ...payload.data }) : INVALID;
    });

    on('host:team-assign', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = teamAssignSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'team-assign', ...payload.data }) : INVALID;
    });

    on('host:truth-hide', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = truthHideSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'truth-hide', ...payload.data }) : INVALID;
    });

    on('host:captain', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = captainSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'captain', ...payload.data }) : INVALID;
    });

    on('host:audio', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = audioCommandSchema.safeParse(payloadOf(args));
      return payload.success ? (isHost ? manager.audio(room, payload.data.action) : NOT_ALLOWED) : INVALID;
    });

    on('host:awards', () => {
      if (!hostSide) return FORBIDDEN;
      return isHost ? manager.awards(room) : NOT_ALLOWED;
    });

    on('host:time', (args) => {
      if (!hostSide) return FORBIDDEN;
      const payload = timeSchema.safeParse(payloadOf(args));
      return payload.success ? run({ type: 'time', ...payload.data }) : INVALID;
    });
  });

  return io;
}
