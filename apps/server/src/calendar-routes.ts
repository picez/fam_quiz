import { calendarDecisionSchema, calendarInputSchema, feedSeenSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import {
  attachGame,
  calendarEventFor,
  cancelEvent,
  createEvent,
  decideRequest,
  hostedEvent,
  listCalendar,
  markCalendarSeen,
  requestToJoin,
  updateEvent,
  withdrawRequest,
  type CalendarProbe,
} from './calendar-store';
import type { Db } from './db/client';
import { getQuiz } from './quizzes';
import type { RoomManager } from './rooms/manager';

export interface CalendarNotify {
  opened(eventId: string): void;
  cancelled(eventId: string): void;
}

export interface CalendarDeps {
  db: Db;
  manager: RoomManager;
  maxRooms: number;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
  /** Web Push (підпроєкт 4); типово нічого. */
  notify?: CalendarNotify;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const INVALID = { error: 'invalid_payload' };
const NOT_FOUND = { error: 'not_found' };

/** probe з менеджера: manager.get(code)?.id === gameId і фаза не finished. */
export function roomProbe(manager: RoomManager): CalendarProbe {
  return (gameId, code) => {
    const room = manager.get(code);
    return room !== undefined && room.id === gameId && room.state.phase !== 'finished';
  };
}

interface Opened {
  status: number;
  body: object;
}

export async function registerCalendarRoutes(app: FastifyInstance, deps: CalendarDeps): Promise<void> {
  const { db, manager, maxRooms, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  const probe = roomProbe(manager);
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });
  const read = perUser('calendar', 60);
  const write = perUser('calendar-write', 30);
  // Відповіді сповіщень не мають валити маршрут: запис уже відбувся.
  const tell = (fn: (() => void) | undefined) => {
    try {
      fn?.();
    } catch (error) {
      console.error('Сповіщення календаря не вдалося:', error);
    }
  };

  app.get('/api/me/calendar', read, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return listCalendar(db, user.id, now(), probe);
  });

  app.post('/api/me/calendar/seen', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = feedSeenSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    await markCalendarSeen(db, user.id, new Date(body.data.upTo), now());
    return reply.code(204).send();
  });

  app.post('/api/calendar', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = calendarInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const at = now();
    const made = await createEvent(db, user.id, body.data, at);
    if (!made.ok) return reply.code(made.error === 'quiz_not_found' ? 404 : 400).send({ error: made.error });
    const event = await calendarEventFor(db, user.id, made.id, at, probe);
    return reply.code(201).send(event);
  });

  app.put<{ Params: { id: string } }>('/api/calendar/:id', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = calendarInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const at = now();
    const done = await updateEvent(db, user.id, request.params.id, body.data, at, probe);
    if (!done.ok) {
      const status = done.error === 'calendar_time' ? 400 : done.error === 'event_locked' ? 409 : 404;
      return reply.code(status).send({ error: done.error });
    }
    return calendarEventFor(db, user.id, request.params.id, at, probe);
  });

  app.delete<{ Params: { id: string } }>('/api/calendar/:id', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const done = await cancelEvent(db, user.id, request.params.id, now(), probe);
    if (!done.ok) return reply.code(done.error === 'event_locked' ? 409 : 404).send({ error: done.error });
    if (done.changed) tell(() => deps.notify?.cancelled(request.params.id));
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/calendar/:id/request', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const done = await requestToJoin(db, user.id, request.params.id, now(), probe);
    if (!done.ok) return reply.code(done.error === 'not_found' ? 404 : done.error === 'own_event' ? 403 : 409).send({ error: done.error });
    return { status: done.status };
  });

  app.delete<{ Params: { id: string } }>('/api/calendar/:id/request', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const done = await withdrawRequest(db, user.id, request.params.id, now());
    if (!done.ok) return reply.code(done.error === 'not_found' ? 404 : 409).send({ error: done.error });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string; userId: string } }>('/api/calendar/:id/requests/:userId', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const body = calendarDecisionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const done = await decideRequest(db, user.id, request.params.id, request.params.userId, body.data.decision, now(), probe);
    if (!done.ok) return reply.code(done.error === 'event_locked' ? 409 : 404).send({ error: done.error });
    return reply.code(204).send();
  });

  // Виклики однієї події йдуть по черзі: другий чекає першого й бачить його кімнату.
  const chains = new Map<string, Promise<unknown>>();
  const openOnce = async (hostId: string, eventId: string): Promise<Opened> => {
    const at = now();
    const found = await hostedEvent(db, hostId, eventId, at, probe);
    if (found === null) return { status: 404, body: NOT_FOUND };
    const { row, state } = found;
    if (state === 'played' || state === 'missed' || state === 'cancelled') return { status: 409, body: { error: 'event_locked' } };
    if (state === 'open') {
      const room = row.gameCode === null ? undefined : manager.get(row.gameCode);
      if (room !== undefined && room.id === row.gameId) {
        return { status: 200, body: { gameId: room.id, code: room.code, hostToken: room.hostToken, stageToken: room.stageToken } };
      }
    }
    const quiz = row.quizId === null ? null : await getQuiz(db, hostId, row.quizId);
    if (row.quizId === null || quiz === null) return { status: 404, body: { error: 'quiz_not_found' } };
    if (manager.size >= maxRooms) return { status: 503, body: { error: 'server_busy' } };
    if (manager.frozen) return { status: 503, body: { error: 'restarting' } };
    const room = manager.create(quiz, hostId, row.quizId);
    // Якщо attachGame кине після create, кімната лишається сиротою (повтор створить другу) — прийнято.
    // Подію скасували чи змінили між перевіркою й записом: кімната-сирота спливе з лобі, пуш не шлемо.
    const attached = await attachGame(db, eventId, room.id, room.code, { quizId: row.quizId, gameId: row.gameId });
    if (!attached) return { status: 409, body: { error: 'event_locked' } };
    tell(() => deps.notify?.opened(eventId));
    return { status: 201, body: { gameId: room.id, code: room.code, hostToken: room.hostToken, stageToken: room.stageToken } };
  };

  app.post<{ Params: { id: string } }>('/api/calendar/:id/open', write, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const eventId = request.params.id;
    const run = (chains.get(eventId) ?? Promise.resolve()).then(() => openOnce(user.id, eventId));
    const tail = run.catch(() => undefined);
    chains.set(eventId, tail);
    try {
      const result = await run;
      return reply.code(result.status).send(result.body);
    } finally {
      if (chains.get(eventId) === tail) chains.delete(eventId);
    }
  });
}
