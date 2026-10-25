import type { Server as HttpServer } from 'node:http';
import {
  adjustSchema,
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
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@quiz/shared';
import { Server, type Socket } from 'socket.io';
import type { Identity, Room, RoomManager } from './rooms/manager';
import type { Located } from './rooms/store';

interface SocketData {
  room: Room;
  identity: Identity;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Формат коду кімнати (RoomManager видає шість цифр). */
const ROOM_CODE = /^\d{6}$/;
const FORBIDDEN: AckResult = { ok: false, error: 'forbidden' };
const INVALID: AckResult = { ok: false, error: 'invalid_payload' };
/** Скільки разів за хвилину одна адреса може питати базу про код, якого немає в пам'яті. */
export const LOOKUPS_PER_MINUTE = 60;
const LOOKUP_WINDOW_MS = 60_000;
const SIMPLE_HOST_ACTIONS = ['start', 'lock', 'next', 'pause', 'resume', 'end-round', 'end', 'dice', 'roll', 'skip', 'duel-skip', 'duel-cancel', 'guide-skip', 'clue', 'survey-all', 'bluff-all'] as const;

/** Клієнт міг не передати функцію підтвердження або передати на її місці що завгодно. */
function reply(args: unknown[], result: AckResult): void {
  const ack = args.at(-1);
  if (typeof ack === 'function') ack(result);
}

/** Перший аргумент події, якщо це дані, а не функція підтвердження. */
function payloadOf(args: unknown[]): unknown {
  return typeof args[0] === 'function' ? undefined : args[0];
}

export interface SocketOptions {
  /** Як у Fastify: true — довіряти X-Forwarded-For повністю, число — кількість проксі перед сервером. */
  trustProxy?: boolean | number;
  lookupsPerMinute?: number;
}

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
  const io: GameServer = new Server(server, { serveClient: false });
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
  });

  const push = (socket: GameSocket) => {
    const { room, identity } = socket.data;
    const view = manager.view(room, identity);
    if (view !== null) {
      socket.emit('state', view, {
        serverNow: manager.now(),
        hostOnline: manager.hostOnline(room),
        stageOnline: manager.stageOnline(room),
      });
    }
  };

  manager.onEvent((room, event) => {
    const members = [...io.sockets.sockets.values()].filter((socket) => socket.data.room === room);
    if (event.type === 'changed') {
      members.forEach(push);
      return;
    }
    if (event.type === 'audio') {
      // Звук знає лише сцена й пульт: телефони не отримують ні команди, ні джерела.
      members
        .filter((socket) => socket.data.identity.role !== 'player')
        .forEach((socket) => socket.emit('audio', { action: event.action, seq: event.seq }));
      return;
    }
    if (event.type === 'moved') {
      // Кімнату веде інший процес: перепідключитися з тим самим токеном.
      for (const socket of members) {
        socket.emit('restarting');
        socket.disconnect(true);
      }
      return;
    }
    const leaving =
      event.type === 'kicked' ? members.filter((s) => s.data.identity.playerId === event.playerId) : members;
    for (const socket of leaving) {
      socket.emit('closed', event.type === 'kicked' ? 'kicked' : 'expired');
      socket.disconnect(true);
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
    manager.connect(room, identity);
    push(socket);
    socket.on('disconnect', () => manager.disconnect(room, identity));

    // Обробники приймають довільні аргументи: типи подій описують чесного клієнта, а не будь-якого.
    const on = (event: keyof ClientToServerEvents, handler: (args: unknown[]) => AckResult) => {
      (socket as unknown as { on(event: string, listener: (...args: unknown[]) => void): void }).on(
        event,
        (...args) => reply(args, handler(args)),
      );
    };
    const isHost = identity.role === 'host';

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

    on('player:sort', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = sortSchema.safeParse(payloadOf(args));
      return payload.success ? manager.sort(room, identity.playerId, payload.data.wordId, payload.data.categoryId) : INVALID;
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
      return payload.success ? manager.buff(room, identity.playerId, payload.data.kind) : INVALID;
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

    for (const type of SIMPLE_HOST_ACTIONS) {
      on(`host:${type}`, () => (isHost ? manager.host(room, { type }) : FORBIDDEN));
    }

    on('host:override', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = overrideSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'override', ...payload.data }) : INVALID;
    });

    on('host:pick', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = pickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'pick', ...payload.data }) : INVALID;
    });

    on('host:duel-category', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = duelPickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'duel-category', ...payload.data }) : INVALID;
    });

    on('host:order', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = orderSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'order', ...payload.data }) : INVALID;
    });

    on('host:cloud-hide', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = cloudHideSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'cloud-hide', ...payload.data }) : INVALID;
    });

    on('host:bluff-remove', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = bluffOptionSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'bluff-remove', ...payload.data }) : INVALID;
    });

    on('host:kick', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = kickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'kick', ...payload.data }) : INVALID;
    });

    on('host:adjust', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = adjustSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'adjust', ...payload.data }) : INVALID;
    });

    on('host:hint', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = hintSchema.safeParse(payloadOf(args));
      return payload.success ? manager.hostHint(room, payload.data.playerId, payload.data.text) : INVALID;
    });

    on('host:ladder-pick', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = ladderPickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.hostLadderPick(room, payload.data.playerId) : INVALID;
    });

    on('host:ladder-decide', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = ladderDecideSchema.safeParse(payloadOf(args));
      return payload.success ? manager.hostLadderDecide(room, payload.data.take) : INVALID;
    });

    on('host:debuff', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = debuffSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'debuff', ...payload.data }) : INVALID;
    });

    on('host:undebuff', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = undebuffSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'undebuff', ...payload.data }) : INVALID;
    });

    on('host:judge', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = judgeSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'judge', ...payload.data }) : INVALID;
    });

    on('host:name', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = nameSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'name', ...payload.data }) : INVALID;
    });

    for (const type of ['accept', 'repick'] as const) {
      on(`host:${type}`, (args) => {
        if (!isHost) return FORBIDDEN;
        const payload = pendingSchema.safeParse(payloadOf(args));
        return payload.success ? manager.host(room, { type, ...payload.data }) : INVALID;
      });
    }

    on('host:audio', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = audioCommandSchema.safeParse(payloadOf(args));
      return payload.success ? manager.audio(room, payload.data.action) : INVALID;
    });

    on('host:time', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = timeSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'time', ...payload.data }) : INVALID;
    });
  });

  return io;
}
