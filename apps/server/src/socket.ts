import type { Server as HttpServer } from 'node:http';
import {
  answerSchema,
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
  timeSchema,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@quiz/shared';
import { Server, type Socket } from 'socket.io';
import type { Identity, Room, RoomManager } from './rooms/manager';

interface SocketData {
  room: Room;
  identity: Identity;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const FORBIDDEN: AckResult = { ok: false, error: 'forbidden' };
const INVALID: AckResult = { ok: false, error: 'invalid_payload' };
const SIMPLE_HOST_ACTIONS = ['start', 'lock', 'next', 'pause', 'resume', 'end-round', 'end', 'roll', 'skip'] as const;

/** Клієнт міг не передати функцію підтвердження або передати на її місці що завгодно. */
function reply(args: unknown[], result: AckResult): void {
  const ack = args.at(-1);
  if (typeof ack === 'function') ack(result);
}

/** Перший аргумент події, якщо це дані, а не функція підтвердження. */
function payloadOf(args: unknown[]): unknown {
  return typeof args[0] === 'function' ? undefined : args[0];
}

export function attachSockets(server: HttpServer, manager: RoomManager): GameServer {
  const io: GameServer = new Server(server, { serveClient: false });

  io.use((socket, next) => {
    const auth = socketAuthSchema.safeParse(socket.handshake.auth);
    const found = auth.success ? manager.identify(auth.data.code, auth.data.role, auth.data.token) : null;
    if (found === null) return next(new Error('unauthorized'));
    socket.data.room = found.room;
    socket.data.identity = found.identity;
    next();
  });

  const push = (socket: GameSocket) => {
    const { room, identity } = socket.data;
    const view = manager.view(room, identity);
    if (view !== null) socket.emit('state', view, { serverNow: manager.now(), hostOnline: manager.hostOnline(room) });
  };

  manager.onEvent((room, event) => {
    const members = [...io.sockets.sockets.values()].filter((socket) => socket.data.room === room);
    if (event.type === 'changed') {
      members.forEach(push);
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

    on('player:hint', () => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      return manager.hint(room, identity.playerId);
    });

    on('player:pick', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = pickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.pick(room, identity.playerId, payload.data.cellId) : INVALID;
    });

    on('player:wager', (args) => {
      if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
      const payload = wagerSchema.safeParse(payloadOf(args));
      return payload.success ? manager.wager(room, identity.playerId, payload.data.amount) : INVALID;
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

    on('host:order', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = orderSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'order', ...payload.data }) : INVALID;
    });

    on('host:kick', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = kickSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'kick', ...payload.data }) : INVALID;
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

    on('host:time', (args) => {
      if (!isHost) return FORBIDDEN;
      const payload = timeSchema.safeParse(payloadOf(args));
      return payload.success ? manager.host(room, { type: 'time', ...payload.data }) : INVALID;
    });
  });

  return io;
}
