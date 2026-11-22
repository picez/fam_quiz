import {
  PROBLEM_GUEST_PER_HOUR,
  PROBLEM_USER_PER_HOUR,
  problemReportInputSchema,
  type MyProblemReport,
  type ProblemGame,
} from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { createProblemReport, myProblemReports } from './problem-store';
import type { RoomManager } from './rooms/manager';

const UNAUTHORIZED = { error: 'unauthorized' };
const INVALID = { error: 'invalid_payload' };
const BODY_LIMIT = 8 * 1024;

export interface ProblemRouteDeps {
  db: Parameters<typeof createProblemReport>[0];
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  /** 70: кімнати в пам'яті — звідки момент гри бере id і назву вікторини. */
  manager: Pick<RoomManager, 'get'>;
  now?: () => Date;
}

/** «Повідомити про проблему» (64): надсилає будь-хто, гість теж; обмеження — за акаунтом чи за адресою. IP у базу не йде. */
export async function registerProblemRoutes(app: FastifyInstance, deps: ProblemRouteDeps): Promise<void> {
  const { db, currentUser, manager } = deps;
  const now = deps.now ?? (() => new Date());

  app.post(
    '/api/problem-reports',
    {
      bodyLimit: BODY_LIMIT,
      config: {
        rateLimit: {
          timeWindow: '1 hour',
          keyGenerator: async (request: FastifyRequest) => {
            const user = await currentUser(request);
            return user === null ? `problem:ip:${request.ip}` : `problem:user:${user.id}`;
          },
          max: (_request: FastifyRequest, key: string) => (key.startsWith('problem:user:') ? PROBLEM_USER_PER_HOUR : PROBLEM_GUEST_PER_HOUR),
        },
      },
    },
    async (request, reply) => {
      const body = problemReportInputSchema.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send(INVALID);
      const user = await currentUser(request);
      // 70: момент гри — як бачила людина, плюс вікторина з кімнати (кімнати немає — null).
      const moment = body.data.game;
      const room = moment === null ? undefined : manager.get(moment.code);
      const game: ProblemGame | null = moment === null ? null : { ...moment, quizId: room?.quizId ?? null, quizTitle: room?.state.quiz.title ?? null };
      const made = await createProblemReport(db, { userId: user?.id ?? null, input: body.data, game, now: now() });
      if ('error' in made) return reply.code(429).send({ error: made.error });
      return reply.code(201).send({ id: made.id });
    },
  );

  app.get('/api/me/problem-reports', async (request, reply): Promise<MyProblemReport[] | void> => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return myProblemReports(db, user.id);
  });
}
