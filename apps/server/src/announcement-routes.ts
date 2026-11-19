import type { FastifyInstance } from 'fastify';
import type { AnnouncementCache } from './announcement-store';

/** Публічне читання оголошення (53): гостям і акаунтам, кеш на хвилину. */
export async function registerAnnouncementRoutes(app: FastifyInstance, deps: { cache: AnnouncementCache }): Promise<void> {
  app.get('/api/announcement', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async () => ({
    announcement: await deps.cache.get(),
  }));
}
