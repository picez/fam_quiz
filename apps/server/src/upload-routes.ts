import { randomBytes } from 'node:crypto';
import { IMAGE_LIMITS } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { EXTENSIONS, isImageName, sniffImage, type ImageStorage } from './storage/images';

export interface UploadDeps {
  storage: ImageStorage;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const BAD_IMAGE = { error: 'bad_image' };
const UNAVAILABLE = { error: 'storage_unavailable' };
const NOT_FOUND = { error: 'not_found' };
const UPLOAD_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export async function registerUploadRoutes(app: FastifyInstance, deps: UploadDeps) {
  const { storage, currentUser } = deps;

  // Окрема область: розбір тіла як файлу й власні відповіді на помилки не зачіпають решту маршрутів.
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      [...IMAGE_LIMITS.types],
      { parseAs: 'buffer', bodyLimit: IMAGE_LIMITS.maxBytes },
      (_request, body, done) => done(null, body),
    );

    scope.setErrorHandler((error: { code?: string; statusCode?: number }, _request, reply) => {
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: 'too_large' });
      if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(400).send(BAD_IMAGE);
      if (error.statusCode === 429) return reply.code(429).send({ error: 'too_many' });
      return reply.code(500).send({ error: 'unknown' });
    });

    // Сесія перевіряється до читання тіла: сторонній не змусить сервер приймати мегабайти.
    scope.addHook('onRequest', async (request, reply) => {
      if ((await currentUser(request)) === null) return reply.code(401).send({ error: 'unauthorized' });
    });

    scope.post('/api/uploads', { config: UPLOAD_LIMIT }, async (request, reply) => {
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes)) return reply.code(400).send(BAD_IMAGE);
      const type = sniffImage(bytes);
      if (type === null) return reply.code(400).send(BAD_IMAGE);
      const name = `${randomBytes(16).toString('hex')}.${EXTENSIONS[type]}`;
      try {
        await storage.put(name, bytes, type);
      } catch (error) {
        console.error('Image upload failed:', error instanceof Error ? error.message : error);
        return reply.code(503).send(UNAVAILABLE);
      }
      return reply.code(201).send({ url: `/uploads/${name}` });
    });
  });

  app.get<{ Params: { name: string } }>('/uploads/:name', async (request, reply) => {
    const { name } = request.params;
    if (!isImageName(name)) return reply.code(404).send(NOT_FOUND);
    let found;
    try {
      found = await storage.get(name);
    } catch (error) {
      console.error('Image read failed:', error instanceof Error ? error.message : error);
      return reply.code(503).send(UNAVAILABLE);
    }
    // Тип береться з вмісту: те, що не є зображенням, не віддається взагалі.
    const type = found === null ? null : sniffImage(found.bytes);
    if (found === null || type === null) return reply.code(404).send(NOT_FOUND);
    return reply
      .header('content-type', type)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'")
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(Buffer.from(found.bytes));
  });
}
