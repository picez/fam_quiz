/**
 * Застарілий чанк після деплою (32): вкладка зі старою версією просить лінивий файл, якого на сервері вже
 * немає (404). Vite кидає подію vite:preloadError — але так само й на будь-який невдалий лінивий імпорт (шрифт ніку,
 * словник мови, рушій трофеїв, сторінка) через слабку мережу. Тому:
 * - подію ніколи не гасимо (preventDefault не кличемо): помилка доходить до місцевих обробників, як і раніше;
 * - перезавантажуємо лише тоді, коли пристрій у мережі, а HEAD того самого файла з сервера дає саме 404 (деплой);
 * - на екранах гри (/play, /host, /stage) не перезавантажуємо ніколи: гра йде далі, а файл підтягнеться пізніше;
 * - позначка в sessionStorage на 30 с не дає зациклитись.
 */
export const STALE_RELOAD_KEY = 'quiz:stale-reload';
export const STALE_RELOAD_WINDOW_MS = 30_000;

const GAME_PATHS = /^\/(play|host|stage)\//;
const CHUNK_URL = /(?:https?:\/\/[^\s'"()]+)?\/assets\/[^\s'"()]+\.(?:js|css)/;

/** Адреса файла з помилки Vite («Failed to fetch dynamically imported module: …», «Unable to preload CSS for …»). */
export function chunkUrlOf(payload: unknown): string | null {
  const message = payload instanceof Error ? payload.message : typeof payload === 'string' ? payload : '';
  return CHUNK_URL.exec(message)?.[0] ?? null;
}

interface StaleChunkOptions {
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  reload?: () => void;
  now?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Шлях поточної сторінки (location.pathname). */
  path?: () => string;
  online?: () => boolean;
  fetch?: (url: string, init: RequestInit) => Promise<{ status: number }>;
}

export function installStaleChunkReload(options: StaleChunkOptions = {}): () => void {
  const target = options.target ?? window;
  const reload = options.reload ?? (() => window.location.reload());
  const now = options.now ?? Date.now;
  const path = options.path ?? (() => window.location.pathname);
  const online = options.online ?? (() => navigator.onLine !== false);
  const request = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  const storage = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    try {
      return options.storage ?? window.sessionStorage;
    } catch {
      return null;
    }
  };
  const recently = (): boolean => {
    try {
      return now() - (Number(storage()?.getItem(STALE_RELOAD_KEY) ?? 0) || 0) < STALE_RELOAD_WINDOW_MS;
    } catch {
      return false;
    }
  };
  const onError = (event: Event): void => {
    if (GAME_PATHS.test(path()) || !online() || recently()) return;
    const url = chunkUrlOf((event as Event & { payload?: unknown }).payload);
    if (url === null) return;
    void request(url, { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        // Лише 404 — файла справді немає (новий деплой); 5xx чи обрив — не привід перезавантажувати.
        if (response.status !== 404 || GAME_PATHS.test(path()) || recently()) return;
        try {
          storage()?.setItem(STALE_RELOAD_KEY, String(now()));
        } catch {
          // Без сховища однаково перезавантажуємо: гірше не стане.
        }
        reload();
      })
      .catch(() => undefined);
  };
  target.addEventListener('vite:preloadError', onError);
  return () => target.removeEventListener('vite:preloadError', onError);
}
