import { quizSchema } from '@quiz/shared';
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from './quizzes';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Auth } from './auth';
import type { Db } from './db/client';
import type { RoomManager } from './rooms/manager';

export interface AccountDeps {
  db: Db;
  auth: Auth;
  manager: RoomManager;
  maxRooms: number;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export async function registerAccountRoutes(app: FastifyInstance, deps: AccountDeps): Promise<void> {
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
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
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

  app.get('/api/quizzes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return listQuizzes(db, user.id);
  });

  app.post('/api/quizzes', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = quizSchema.safeParse(request.body);
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

  app.put<WithId>('/api/quizzes/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const parsed = quizSchema.safeParse(request.body);
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
}
