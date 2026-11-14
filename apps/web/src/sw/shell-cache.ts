import { LOCALE_CODES, pushStringsFor } from '../push/push-strings';

/**
 * Кеш оболонки застосунку для сервіс-воркера (32). Без Workbox і без @quiz/shared: воркер лишається малим.
 * Усе, що торкається браузера (caches, fetch, таймер), приходить параметром, тож модуль тестується в node.
 *
 * Сторінки: спершу мережа (NAV_TIMEOUT_MS), кешований /index.html лише запасний, тож старий застосунок не
 * залишається назавжди. Хешовані /assets: спершу кеш. /api, /socket.io, /uploads, /stickers, /sw.js і запити
 * з Range воркер не чіпає зовсім.
 */

export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export interface CacheDeps {
  caches: { open(name: string): Promise<CacheLike>; keys(): Promise<string[]>; delete(name: string): Promise<boolean> };
  fetch: (request: Request | string) => Promise<Response>;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

export const NAV_TIMEOUT_MS = 4000;

const PREFIX = 'quiz-';
const SHELL_KEY = '/index.html';
const PASS_PREFIXES = ['/api/', '/socket.io/', '/uploads/', '/stickers/'];

export function cacheNames(version: string): { shell: string; assets: string } {
  return { shell: `${PREFIX}shell-${version}`, assets: `${PREFIX}assets-${version}` };
}

type RouteRequest = { method: string; url: string; mode: string; headers: { has(n: string): boolean } };

/** Що робити із запитом: сторінка, хешований файл чи пропустити в мережу без воркера. */
export function routeOf(request: RouteRequest, origin: string): 'navigate' | 'asset' | 'pass' {
  if (request.method !== 'GET' || request.headers.has('range')) return 'pass';
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return 'pass';
  }
  if (url.origin !== origin) return 'pass';
  const path = url.pathname;
  if (path === '/sw.js' || PASS_PREFIXES.some((prefix) => path.startsWith(prefix) || path === prefix.slice(0, -1))) return 'pass';
  if (request.mode === 'navigate') return 'navigate';
  if (path.startsWith('/assets/')) return 'asset';
  return 'pass';
}

const isHtml = (response: Response): boolean => (response.headers.get('content-type') ?? '').includes('text/html');

/** Можна класти як оболонку: 200, без переадресації, HTML. */
const isShellResponse = (response: Response): boolean => response.status === 200 && !response.redirected && isHtml(response);

/** Можна класти як файл: 200, не HTML (сторінка під іменем чанка — ознака помилки). */
const isAssetResponse = (response: Response): boolean => response.status === 200 && !response.redirected && !isHtml(response);

/** Кладе оболонку поштучно; збій одного файла (чи всього кешу) не зриває встановлення воркера, пуші працюють далі. */
export async function precacheShell(deps: CacheDeps, version: string, files: readonly string[]): Promise<void> {
  try {
    const cache = await deps.caches.open(cacheNames(version).shell);
    await Promise.allSettled(
      [...new Set(files)].map(async (file) => {
        const response = await deps.fetch(file);
        const fits = file === SHELL_KEY ? isShellResponse(response) : response.status === 200 && !response.redirected;
        if (fits) await cache.put(file, response);
      }),
    );
  } catch {
    // Кешу немає (приватний режим, квота): воркер однаково встановлюється.
  }
}

/** Прибирає наші кеші попередніх версій; чужі (не quiz-*) не чіпає. */
export async function dropOldCaches(deps: CacheDeps, version: string): Promise<void> {
  try {
    const { shell, assets } = cacheNames(version);
    const names = await deps.caches.keys();
    await Promise.allSettled(names.filter((name) => name.startsWith(PREFIX) && name !== shell && name !== assets).map((name) => deps.caches.delete(name)));
  } catch {
    // Не вдалося прибрати: спробуємо на наступній активації.
  }
}

async function cachedShell(deps: CacheDeps, version: string): Promise<Response | undefined> {
  try {
    return await (await deps.caches.open(cacheNames(version).shell)).match(SHELL_KEY);
  } catch {
    return undefined;
  }
}

async function storeShell(deps: CacheDeps, version: string, response: Response): Promise<void> {
  try {
    await (await deps.caches.open(cacheNames(version).shell)).put(SHELL_KEY, response);
  } catch {
    // Квота чи приватний режим: сторінка однаково віддана з мережі.
  }
}

/**
 * Навігація: спершу мережа. Якщо мережа впала, віддаємо кешовану оболонку, а коли кешу немає, сторінку
 * «Немає зв'язку». Якщо мережа не відповіла за NAV_TIMEOUT_MS, віддаємо кеш (а без кешу чекаємо далі:
 * повільна мережа краща за сторінку-заглушку). Пізня відповідь однаково оновлює кеш; waitUntil тримає воркер живим.
 */
export async function handleNavigate(
  deps: CacheDeps,
  version: string,
  request: Request,
  locale: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const network = deps.fetch(request).then(async (response) => {
    if (isShellResponse(response)) await storeShell(deps, version, response.clone());
    return response;
  });
  waitUntil?.(network.catch(() => undefined));
  const timedOut = new Promise<'timeout'>((resolve) => {
    deps.setTimeout(() => resolve('timeout'), NAV_TIMEOUT_MS);
  });
  const first = await Promise.race([network.catch(() => 'error' as const), timedOut]);
  if (first instanceof Response) {
    // 5xx (сервер перезапускається, Cloudflare не бачить origin): краще вчорашня оболонка, ніж сторінка помилки.
    if (first.status < 500) return first;
    return (await cachedShell(deps, version)) ?? first;
  }
  const cached = await cachedShell(deps, version);
  if (cached !== undefined) return cached;
  if (first === 'timeout') {
    try {
      return await network;
    } catch {
      return offlinePage(locale);
    }
  }
  return offlinePage(locale);
}

/** Хешований файл: спершу кеш (оболонка чи вже завантажені лінивні чанки), інакше мережа й у кеш. */
export async function handleAsset(deps: CacheDeps, version: string, request: Request): Promise<Response> {
  const key = new URL(request.url).pathname;
  const { shell, assets } = cacheNames(version);
  let store: CacheLike | undefined;
  try {
    const hit = (await (await deps.caches.open(shell)).match(key)) ?? (await (store = await deps.caches.open(assets)).match(key));
    if (hit !== undefined) return hit;
  } catch {
    store = undefined;
  }
  const response = await deps.fetch(request);
  if (store !== undefined && isAssetResponse(response)) {
    try {
      await store.put(key, response.clone());
    } catch {
      // Квота: файл однаково віддано.
    }
  }
  return response;
}

/** Перший збіг з LOCALE_CODES у порядку Accept-Language, інакше uk. */
export function localeFromHeader(header: string | null): string {
  for (const part of (header ?? '').split(',')) {
    const primary = (part.split(';')[0] ?? '').trim().toLowerCase().split('-')[0] ?? '';
    if (LOCALE_CODES.includes(primary)) return primary;
  }
  return 'uk';
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** Маленька сторінка «Немає зв'язку» без зовнішніх файлів: віддається, коли немає ні мережі, ні кешу. */
export function offlinePage(locale: string): Response {
  const lang = LOCALE_CODES.includes(locale) ? locale : 'uk';
  const t = pushStringsFor(lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(t('swOfflineTitle'))}</title>
<style>
html{background:#060505;color:#f4efe6;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;box-sizing:border-box}
main{max-width:26rem;text-align:center}
h1{font-size:1.5rem;margin:0 0 .75rem}
p{line-height:1.5;margin:0 0 1.5rem;color:#d9d2c5}
button{font:inherit;font-weight:600;color:#060505;background:#f4efe6;border:0;border-radius:999px;padding:.8rem 1.6rem;min-height:44px;cursor:pointer}
button:focus-visible{outline:3px solid #ffd166;outline-offset:3px}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(t('swOfflineTitle'))}</h1>
<p>${escapeHtml(t('swOfflineBody'))}</p>
<button type="button" onclick="location.reload()">${escapeHtml(t('swOfflineRetry'))}</button>
</main>
</body>
</html>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
