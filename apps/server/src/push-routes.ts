import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { Db } from './db/client';
import type { PushService } from './push';
import { deleteOwnSubscription, saveSubscription } from './push-store';

export interface PushRouteDeps {
  db: Db;
  service: PushService | null;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  now?: () => Date;
}

export async function registerPushRoutes(app: FastifyInstance, deps: PushRouteDeps): Promise<void> {
  const { db, service, currentUser } = deps;
  const now = deps.now ?? (() => new Date());
  const perUser = (prefix: string, max: number) => ({
    config: {
      rateLimit: {
        max,
        timeWindow: '1 minute',
        keyGenerator: async (request: FastifyRequest) => `${prefix}:${(await currentUser(request))?.id ?? request.ip}`,
      },
    },
  });
  const limited = perUser('push', 10);

  app.get('/api/push/key', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => ({
    publicKey: service?.publicKey ?? null,
  }));

  app.post('/api/me/push', limited, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send({ error: 'unauthorized' });
    if (service === null) return reply.code(404).send({ error: 'push_disabled' });
    const body = pushSubscriptionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    await saveSubscription(db, user.id, body.data, now());
    return reply.code(204).send();
  });

  app.delete('/api/me/push', limited, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send({ error: 'unauthorized' });
    if (service === null) return reply.code(404).send({ error: 'push_disabled' });
    const body = pushUnsubscribeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_payload' });
    await deleteOwnSubscription(db, user.id, body.data.endpoint);
    return reply.code(204).send();
  });
}
