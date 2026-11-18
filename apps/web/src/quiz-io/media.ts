import { safeSlug } from '../share-image';

/** Адреса завантаженого файлу вікторини: рядок вмісту, що повністю збігається з цим шаблоном. */
export const MEDIA_URL = /^\/uploads\/([a-z0-9]{16,64}\.(?:jpg|png|webp|mp3|ogg|m4a))$/;
export const MEDIA_NAME = /^[a-z0-9]{16,64}\.(jpg|png|webp|mp3|ogg|m4a)$/;

export type MediaKind = 'image' | 'audio';

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

function extension(name: string): string {
  return name.slice(name.lastIndexOf('.') + 1);
}

export function mediaKind(name: string): MediaKind {
  return TYPES[extension(name)]?.startsWith('audio/') ? 'audio' : 'image';
}

export function mediaType(name: string): string {
  return TYPES[extension(name)] ?? 'application/octet-stream';
}

/** Усі різні адреси завантажень у довільному вмісті, у порядку першої появи. */
export function mediaUrls(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (MEDIA_URL.test(node)) found.add(node);
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node !== null && typeof node === 'object') {
      for (const item of Object.values(node)) walk(item);
    }
  };
  walk(value);
  return [...found];
}

/** Нова копія, де рядки, що повністю збігаються з ключем мапи, замінено; оригінал не змінюється. */
export function replaceMedia<T>(value: T, map: ReadonlyMap<string, string>): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return map.get(node) ?? node;
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, walk(item)]));
    }
    return node;
  };
  return walk(value) as T;
}

/** <безпечна назва>.<ext>; порожня назва — quiz.<ext>. */
export function quizFileName(title: string, ext: 'quiz' | 'xlsx'): string {
  const slug = safeSlug(title);
  return `${slug === '' ? 'quiz' : slug}.${ext}`;
}
