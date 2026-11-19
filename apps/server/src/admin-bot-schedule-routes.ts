import { BOT_USER_ID, botPlanInputSchema, type AdminBotPerson } from '@quiz/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { cancelPlan, createPlan, updatePlan, type BotPlanResult } from './bot-plan-store';
import { searchProfiles } from './profiles';

const NOT_FOUND = { error: 'not_found' };
const INVALID = { error: 'invalid_payload' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUERY = 40;

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

/** Помилка сховища плану → відповідь: час і тіло — 400, немає — 404, ліміт і замок — 409. */
function refuse(reply: FastifyReply, error: Extract<BotPlanResult, { ok: false }>['error']) {
  switch (error) {
    case 'not_found':
      return reply.code(404).send(NOT_FOUND);
    case 'invalid_payload':
      return reply.code(400).send(INVALID);
    case 'plan_time':
      return reply.code(400).send({ error: 'plan_time' });
    default:
      return reply.code(409).send({ error });
  }
}

/** Розклад ігор бота (56): плани, пошук людей. Усе за воротами адмінки; не-адміну й гостю — 404 як невідомий маршрут. */
export async function registerAdminBotScheduleRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());

  app.post('/api/admin/bot/plans', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const body = botPlanInputSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const made = await createPlan(db, me.id, body.data, now());
    return made.ok ? reply.code(201).send(made.plan) : refuse(reply, made.error);
  });

  app.put<{ Params: { id: string } }>('/api/admin/bot/plans/:id', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const body = botPlanInputSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send(INVALID);
    const done = await updatePlan(db, me.id, id, body.data, now());
    return done.ok ? reply.code(200).send(done.plan) : refuse(reply, done.error);
  });

  app.post<{ Params: { id: string } }>('/api/admin/bot/plans/:id/cancel', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    const { id } = request.params;
    if (!UUID.test(id)) return reply.code(404).send(NOT_FOUND);
    const done = await cancelPlan(db, me.id, id, now());
    return done.ok ? reply.code(204).send() : refuse(reply, done.error);
  });

  // Пошук за нікнеймом: лише id, нікнейм і аватар, без пошти; адмін знаходить і себе, бот і забанені — ні.
  app.get<{ Querystring: { q?: unknown } }>(
    '/api/admin/bot/people',
    {
      ...read,
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          keyGenerator: async (request: FastifyRequest) => `admin-bot-people:${(await adminOf(request))?.id ?? request.ip}`,
          allowList: async (request: FastifyRequest) => (await adminOf(request)) === null,
        },
      },
    },
    async (request, reply): Promise<AdminBotPerson[] | FastifyReply> => {
      if ((await adminOf(request)) === null) return reply.code(404).send(NOT_FOUND);
      const { q } = request.query;
      if (typeof q !== 'string' || q.length > MAX_QUERY) return reply.code(400).send(INVALID);
      const found = await searchProfiles(db, q, BOT_USER_ID);
      return found.flatMap(({ id, nickname, avatar }) => (nickname === null ? [] : [{ id, nickname, avatar }]));
    },
  );
}
