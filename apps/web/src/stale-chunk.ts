/**
 * Застарілий чанк після деплою (32): вкладка зі старою версією просить лінивий файл, якого на сервері вже
 * немає (404). Vite кидає подію vite:preloadError; перезавантажуємо сторінку один раз, щоб узяти нову версію.
 * Позначка в sessionStorage на 30 с не дає зациклитись, якщо файл зник не через деплой: тоді помилка йде далі.
 */
export const STALE_RELOAD_KEY = 'quiz:stale-reload';
export const STALE_RELOAD_WINDOW_MS = 30_000;

interface StaleChunkOptions {
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  reload?: () => void;
  now?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

export function installStaleChunkReload(options: StaleChunkOptions = {}): () => void {
  const target = options.target ?? window;
  const reload = options.reload ?? (() => window.location.reload());
  const now = options.now ?? Date.now;
  const storage = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    try {
      return options.storage ?? window.sessionStorage;
    } catch {
      return null;
    }
  };
  const onError = (event: Event): void => {
    const store = storage();
    let last = 0;
    try {
      last = Number(store?.getItem(STALE_RELOAD_KEY) ?? 0) || 0;
    } catch {
      last = 0;
    }
    const at = now();
    if (at - last < STALE_RELOAD_WINDOW_MS) return;
    try {
      store?.setItem(STALE_RELOAD_KEY, String(at));
    } catch {
      // Без сховища однаково перезавантажуємо: гірше не стане.
    }
    event.preventDefault();
    reload();
  };
  target.addEventListener('vite:preloadError', onError);
  return () => target.removeEventListener('vite:preloadError', onError);
}
