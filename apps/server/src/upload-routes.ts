import { randomBytes } from 'node:crypto';
import { AUDIO_LIMITS, IMAGE_LIMITS } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CurrentUser } from './account-routes';
import { EXTENSIONS, isAudioName, isMediaName, sniffAudio, sniffImage, type ImageStorage, type MediaType } from './storage/images';

export interface UploadDeps {
  storage: ImageStorage;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

const BAD_IMAGE = { error: 'bad_image' };
const BAD_AUDIO = { error: 'bad_audio' };
const UNAVAILABLE = { error: 'storage_unavailable' };
const NOT_FOUND = { error: 'not_found' };

export async function registerUploadRoutes(app: FastifyInstance, deps: UploadDeps) {
  const { storage, currentUser } = deps;
  // Рахунок ведеться за акаунтом: зміна адреси не дає завантажити більше.
  const UPLOAD_LIMIT = {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: async (request: FastifyRequest) => `upload:${(await currentUser(request))?.id ?? request.ip}`,
    },
  };

  // Окремі області (зображення, аудіо): розбір тіла як файлу й власні відповіді на помилки не зачіпають решту маршрутів.
  const registerUpload = (
    path: string,
    kind: { types: readonly string[]; maxBytes: number; bad: { error: string }; tooLarge: { error: string }; sniff: (bytes: Uint8Array) => MediaType | null },
  ) =>
    app.register(async (scope) => {
      scope.addContentTypeParser([...kind.types], { parseAs: 'buffer', bodyLimit: kind.maxBytes }, (_request, body, done) => done(null, body));

      scope.setErrorHandler((error: { code?: string; statusCode?: number }, _request, reply) => {
        if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send(kind.tooLarge);
        if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(400).send(kind.bad);
        if (error.statusCode === 429) return reply.code(429).send({ error: 'too_many' });
        return reply.code(500).send({ error: 'unknown' });
      });

      // Сесія перевіряється до читання тіла: сторонній не змусить сервер приймати мегабайти.
      scope.addHook('onRequest', async (request, reply) => {
        if ((await currentUser(request)) === null) return reply.code(401).send({ error: 'unauthorized' });
      });

      scope.post(path, { config: UPLOAD_LIMIT }, async (request, reply) => {
        const bytes = request.body;
        if (!Buffer.isBuffer(bytes)) return reply.code(400).send(kind.bad);
        const type = kind.sniff(bytes);
        if (type === null) return reply.code(400).send(kind.bad);
        const name = `${randomBytes(16).toString('hex')}.${EXTENSIONS[type]}`;
        try {
          await storage.put(name, bytes, type);
        } catch (error) {
          console.error('Upload failed:', error instanceof Error ? error.message : error);
          return reply.code(503).send(UNAVAILABLE);
        }
        return reply.code(201).send({ url: `/uploads/${name}` });
      });
    });

  await registerUpload('/api/uploads', {
    types: IMAGE_LIMITS.types,
    maxBytes: IMAGE_LIMITS.maxBytes,
    bad: BAD_IMAGE,
    tooLarge: { error: 'too_large' },
    sniff: sniffImage,
  });
  await registerUpload('/api/uploads/audio', {
    types: AUDIO_LIMITS.types,
    maxBytes: AUDIO_LIMITS.maxBytes,
    bad: BAD_AUDIO,
    tooLarge: { error: 'audio_too_large' },
    sniff: sniffAudio,
  });

  app.get<{ Params: { name: string } }>('/uploads/:name', async (request, reply) => {
    const { name } = request.params;
    if (!isMediaName(name)) return reply.code(404).send(NOT_FOUND);
    let found;
    try {
      found = await storage.get(name);
    } catch (error) {
      console.error('Upload read failed:', error instanceof Error ? error.message : error);
      return reply.code(503).send(UNAVAILABLE);
    }
    // Тип береться з вмісту: те, що не є зображенням чи аудіо, не віддається взагалі.
    const type = found === null ? null : isAudioName(name) ? sniffAudio(found.bytes) : sniffImage(found.bytes);
    if (found === null || type === null) return reply.code(404).send(NOT_FOUND);
    const bytes = Buffer.from(found.bytes);
    reply
      .header('content-type', type)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'")
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('accept-ranges', 'bytes');
    const header = request.headers.range;
    if (header === undefined) return reply.send(bytes);
    const range = parseRange(header, bytes.length);
    if (range === null) return reply.code(416).header('content-range', `bytes */${bytes.length}`).send();
    return reply
      .code(206)
      .header('content-range', `bytes ${range.start}-${range.end}/${bytes.length}`)
      .send(bytes.subarray(range.start, range.end + 1));
  });
}

/**
 * Один діапазон «bytes=a-b», «bytes=a-» чи «bytes=-n» у межах файлу розміром size; null — діапазон некоректний
 * чи поза файлом (відповідь 416). Кілька діапазонів не підтримуються.
 */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d{1,15})?-(\d{1,15})?$/.exec(header.trim());
  if (match === null || size === 0) return null;
  const [, first, last] = match;
  if (first === undefined && last === undefined) return null;
  if (first === undefined) {
    const length = Number(last);
    return length === 0 ? null : { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  const end = last === undefined ? size - 1 : Math.min(Number(last), size - 1);
  return start >= size || end < start ? null : { start, end };
}
