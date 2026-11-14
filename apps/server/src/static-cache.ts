/**
 * Заголовки кешування для файлів клієнта (32). Хешовані /assets не змінюються ніколи, тож живуть рік;
 * сторінка, сервіс-воркер і маніфест щоразу перепитуються (no-cache), щоб новий деплой підхоплювався
 * одразу; решта нехешованих файлів (мапи, моделі, іконки) змінюється рідко й живе добу.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
const ONE_DAY = 'public, max-age=86400';

const ALWAYS_FRESH = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);

/** Шлях відносно кореня клієнта (з / на початку чи без, з \ у Windows); суфікс .br / .gz не враховується. */
export function cacheControlFor(path: string): string {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.(br|gz)$/, '');
  if (clean.startsWith('assets/')) return IMMUTABLE;
  if (ALWAYS_FRESH.has(clean)) return REVALIDATE;
  return ONE_DAY;
}

/** Запит на файл збірки, якого немає: він має отримати 404, а не сторінку застосунку (інакше браузер чи кеш воркера сприйме HTML як JS). */
export function isMissingFile(url: string): boolean {
  const pathname = url.split('?')[0] ?? '';
  return /^\/(assets|maps|models)\//.test(pathname);
}
