import { quizFolderInputSchema, quizFolderMoveSchema, quizFolderOrderSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CODE_LIMIT, type CurrentUser } from './account-routes';
import type { Db } from './db/client';
import { createFolder, deleteFolder, listFolders, moveQuiz, renameFolder, reorderFolders } from './quiz-folders';

/** 73: особисті категорії вікторин — лише автор (401 для гостя); чуже й невідоме — 404 без підказки, чи воно існує. */
export interface QuizFolderDeps {
  db: Db;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };

type IdParams = { Params: { id: string } };

export async function registerQuizFolderRoutes(app: FastifyInstance, deps: QuizFolderDeps): Promise<void> {
  const { db, currentUser } = deps;
  const now = deps.now ?? (() => new Date());

  const signedIn = async (request: FastifyRequest, reply: FastifyReply): Promise<CurrentUser | null> => {
    const user = await currentUser(request);
    if (user === null) await reply.code(401).send(UNAUTHORIZED);
    return user;
  };

  app.get('/api/quiz-folders', async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    return listFolders(db, user.id);
  });

  app.post('/api/quiz-folders', CODE_LIMIT, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = quizFolderInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await createFolder(db, user.id, body.data.name, now());
    if (!result.ok) return reply.code(409).send({ error: result.error });
    return reply.code(201).send(result.folder);
  });

  // Статичний «order» Fastify віддає раніше за /:id (тест це перевіряє).
  app.put('/api/quiz-folders/order', CODE_LIMIT, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = quizFolderOrderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await reorderFolders(db, user.id, body.data.ids, now());
    if (!result.ok) return reply.code(409).send({ error: result.error });
    return result.folders;
  });

  app.put<IdParams>('/api/quiz-folders/:id', CODE_LIMIT, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = quizFolderInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    const result = await renameFolder(db, user.id, request.params.id, body.data.name, now());
    if (!result.ok) return reply.code(result.error === 'not_found' ? 404 : 409).send({ error: result.error });
    return result.folder;
  });

  app.delete<IdParams>('/api/quiz-folders/:id', CODE_LIMIT, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    if (!(await deleteFolder(db, user.id, request.params.id))) return reply.code(404).send(NOT_FOUND);
    return reply.code(204).send();
  });

  /** Перекладання не змінює updated_at вікторини: «нещодавно змінені» — про її вміст. */
  app.put<IdParams>('/api/quizzes/:id/folder', CODE_LIMIT, async (request, reply) => {
    const user = await signedIn(request, reply);
    if (user === null) return reply;
    const body = quizFolderMoveSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(INVALID);
    if (!(await moveQuiz(db, user.id, request.params.id, body.data.folderId))) return reply.code(404).send(NOT_FOUND);
    return { folderId: body.data.folderId };
  });
}
