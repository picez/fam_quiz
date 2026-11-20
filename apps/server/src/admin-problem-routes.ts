import {
  adminErrorsQuerySchema,
  adminProblemsQuerySchema,
  problemReplySchema,
  type AdminList,
  type AdminProblemReport,
  type AdminProblemsBadge,
  type AdminServerError,
} from '@quiz/shared';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { listServerErrors, problemsBadge, resolveServerError } from './error-store';
import { listProblemReports, resolveProblem } from './problem-store';
import { subscriptionsOf } from './push-store';

const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

type IdParams = { Params: { id: string } };

/** Вкладка «Збої» (64): усе за воротами адмінки; не-адміну й гостю — та сама 404, що й невідомому маршруту. */
export async function registerAdminProblemRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db, push } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());

  app.get('/api/admin/problems/badge', read, async (): Promise<AdminProblemsBadge> => problemsBadge(db));

  app.get('/api/admin/errors', read, async (request, reply): Promise<AdminList<AdminServerError> | void> => {
    const query = adminErrorsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send(INVALID);
    return listServerErrors(db, query.data, now());
  });

  app.post<IdParams>('/api/admin/errors/:id/resolve', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const done = await resolveServerError(db, { adminId: me.id, id: request.params.id, now: now() });
    if (done === 'not_found') return reply.code(404).send(NOT_FOUND);
    return {};
  });

  app.get('/api/admin/problems', read, async (request, reply): Promise<AdminList<AdminProblemReport> | void> => {
    const query = adminProblemsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send(INVALID);
    return listProblemReports(db, query.data);
  });

  app.post<IdParams>('/api/admin/problems/:id/resolve', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const done = await resolveProblem(db, { adminId: me.id, id: request.params.id, reply: null, now: now() });
    if (!done.ok) return reply.code(404).send(NOT_FOUND);
    return {};
  });

  app.post<IdParams>('/api/admin/problems/:id/reply', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const body = problemReplySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const done = await resolveProblem(db, { adminId: me.id, id: request.params.id, reply: body.data.text, now: now() });
    if (!done.ok) return reply.code(done.error === 'not_found' ? 404 : 409).send(done.error === 'not_found' ? NOT_FOUND : { error: done.error });
    const userId = done.userId!;
    // Відповідь — особисте, а не розсилка: іде незалежно від admin_push.
    const pushed = push !== null && (await subscriptionsOf(db, [userId])).length > 0;
    push?.background(push.deliver([userId], { kind: 'problem_reply', reportId: request.params.id, text: body.data.text }));
    return { pushed };
  });
}
