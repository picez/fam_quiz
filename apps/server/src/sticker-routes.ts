import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stickerOf } from '@quiz/shared';
import type { FastifyInstance } from 'fastify';
import { sniffSticker, type ImageStorage, type StickerType } from './storage/images';

export interface StickerDeps {
  storage: ImageStorage;
  /** Віддавати малу картинку, коли справжнього файла немає (локально й у тестах). */
  fixtures: boolean;
}

const NOT_FOUND = { error: 'not_found' };
const UNAVAILABLE = { error: 'storage_unavailable' };
const FIXTURES = resolve(import.meta.dirname, '../fixtures/stickers');
const TYPES: Record<'gif' | 'png', StickerType> = { gif: 'image/gif', png: 'image/png' };

/** `<id>.<ext>`, де id є в маніфесті й має саме це розширення; інакше null. */
function parse(file: string): { key: string; ext: 'gif' | 'png' } | null {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;
  const sticker = stickerOf(file.slice(0, dot));
  return sticker !== undefined && sticker.ext === file.slice(dot + 1) ? { key: `stickers/${file}`, ext: sticker.ext } : null;
}

export async function registerStickerRoutes(app: FastifyInstance, deps: StickerDeps): Promise<void> {
  const { storage, fixtures } = deps;
  // Обмежений маніфестом (≈12 МБ), тож тримаємо справжні файли в пам'яті.
  const cache = new Map<string, Buffer>();
  const samples = new Map<string, Buffer>();

  app.get<{ Params: { file: string } }>('/stickers/:file', async (request, reply) => {
    const parsed = parse(request.params.file);
    if (parsed === null) return reply.code(404).send(NOT_FOUND);
    const { key, ext } = parsed;
    const type = TYPES[ext];

    let bytes = cache.get(key);
    if (bytes === undefined) {
      let found;
      try {
        found = await storage.get(key);
      } catch {
        return reply.code(503).send(UNAVAILABLE);
      }
      if (found !== null && sniffSticker(found.bytes) === type) {
        bytes = Buffer.from(found.bytes);
        cache.set(key, bytes);
      }
    }
    if (bytes !== undefined) {
      return reply
        .header('content-type', type)
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'public, max-age=31536000, immutable')
        .send(bytes);
    }
    if (!fixtures) return reply.code(404).send(NOT_FOUND);
    let sample = samples.get(ext);
    if (sample === undefined) {
      sample = await readFile(resolve(FIXTURES, `sample.${ext}`));
      samples.set(ext, sample);
    }
    return reply
      .header('content-type', type)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'no-store')
      .send(sample);
  });
}
