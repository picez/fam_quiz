import type { TrophySnapshot } from './engine-types';
import { loadTrophyEngine, webglAvailable } from './loadEngine';
import { trophyLabel, type TrophyLook } from './trophy-meta';

/**
 * Статичні знімки трофеїв (29a) для полиць і списків нагород: один знімок на вигляд, знімки робляться по одному
 * через спільний рендерер рушія, живих WebGL-сцен на сторінці не лишається. Готові знімки лежать і в сховищі
 * браузера (Cache API): повторний візит, де всі кубки вже зняті, не вантажить чанк three.js зовсім.
 */

/**
 * Версія знімків: підняти, коли змінюється вигляд рушія (моделі, матеріали, світло, кадрування, розмір знімка) —
 * старі знімки тоді не показуються і стираються.
 */
export const SNAPSHOT_VERSION = 1;
/** Скільки знімків тримає сховище браузера; найстаріші йдуть першими. */
export const STORED_MAX = 50;

/** Сховище знімків між візитами: ключ — рядок вигляду з версією й щільністю пікселів, значення — data URL. */
export interface PictureStore {
  get(key: string): Promise<string | null>;
  put(key: string, url: string): Promise<void>;
}

const CACHE_PREFIX = 'trophy-pictures-v';
const CACHE_NAME = `${CACHE_PREFIX}${SNAPSHOT_VERSION}`;

/** SHA-256 у hex; без crypto.subtle (не захищений контекст) — null, і знімок не зберігається. */
async function hashOf(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

let cleaned: Promise<void> | null = null;

/** Кеш поточної версії; кеші старих версій стираються раз за сторінку. */
async function openCache(): Promise<Cache> {
  cleaned ??= caches
    .keys()
    .then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
    .then(
      () => undefined,
      () => undefined,
    );
  await cleaned;
  return caches.open(CACHE_NAME);
}

const requestOf = (hash: string) => new Request(new URL(`/__trophy-picture/${hash}`, location.origin).href);

/** Сховище на Cache API: будь-який збій — промах (знімок зробиться заново). */
export const cacheStore: PictureStore = {
  async get(key) {
    try {
      const hash = await hashOf(key);
      if (hash === null) return null;
      const found = await (await openCache()).match(requestOf(hash));
      return found === undefined ? null : await found.text();
    } catch {
      return null;
    }
  },
  async put(key, url) {
    try {
      const hash = await hashOf(key);
      if (hash === null) return;
      const cache = await openCache();
      await cache.put(requestOf(hash), new Response(url, { headers: { 'content-type': 'text/plain' } }));
      // Ключі йдуть у порядку додавання: зайве — найстаріші.
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - STORED_MAX)).map((request) => cache.delete(request)));
    } catch {
      // Сховище повне чи недоступне — знімок лишається лише в пам'яті.
    }
  },
};

let store: PictureStore | null = typeof caches === 'undefined' ? null : cacheStore;

/** Підмінити сховище (тести); null — без сховища. */
export function setPictureStore(next: PictureStore | null): void {
  store = next;
}

const pending = new Map<string, Promise<string | null>>();
/** Готові знімки: компонент бере їх одразу, без кадру зі значком. */
const ready = new Map<string, string>();
/** Черга знімків: наступний починається, коли попередній закінчився (вдало чи ні). */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Дочекатися видимої вкладки: у прихованій requestAnimationFrame стоїть, і знімок чекав би до тайм-ауту рушія.
 * Знімки в черзі відкладаються, доки вкладка знову не стане видимою (visibilitychange).
 */
function whenVisible(): Promise<void> {
  if (typeof document === 'undefined' || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onChange);
      resolve();
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

async function shoot(look: TrophyLook): Promise<TrophySnapshot | null> {
  if (!webglAvailable()) return null;
  const engine = await loadTrophyEngine();
  if (engine?.snapshot === undefined) return null;
  try {
    return await engine.snapshot(look, trophyLabel(look));
  } catch {
    return null;
  }
}

/** Ключ кешу знімків для вигляду. */
export const pictureKey = (look: TrophyLook): string => JSON.stringify(look);

/** Ключ сховища: версія знімків, щільність пікселів (знімок ×dpr, до 2) і вигляд. */
const storedKey = (key: string) => `${SNAPSHOT_VERSION}|${Math.min(Math.max(globalThis.devicePixelRatio || 1, 1), 2)}|${key}`;

/** Готовий знімок вигляду, якщо він уже є в пам'яті. */
export const readyPicture = (look: TrophyLook): string | null => ready.get(pictureKey(look)) ?? null;

/**
 * Знімок вигляду: data URL (WebP, на старому Safari — PNG) або null (без WebGL, рушій не завантажився, модель не прийшла). Спершу — пам'ять, потім
 * сховище браузера (без рушія), і лише потім знімок у черзі. Рівні вигляди діляться одним знімком; null не кешується —
 * наступний показ спробує знову.
 */
export function trophyPicture(look: TrophyLook): Promise<string | null> {
  const key = pictureKey(look);
  const known = pending.get(key);
  if (known !== undefined) return known;
  const saved = store;
  const next = (saved === null ? Promise.resolve(null) : saved.get(storedKey(key))).then((stored) => {
    if (stored !== null) return stored;
    const shot = queue.then(whenVisible).then(() => shoot(look));
    queue = shot;
    return shot.then((taken) => {
      if (taken === null) return null;
      // Неповний знімок (фото, шрифт чи наліпка намальовані запасними) — лише в пам'яті цього візиту.
      if (taken.complete && saved !== null) void saved.put(storedKey(key), taken.url);
      return taken.url;
    });
  });
  pending.set(key, next);
  void next.then((url) => {
    if (url === null) pending.delete(key);
    else ready.set(key, url);
  });
  return next;
}

/** Лише для тестів: забути знімки в пам'яті. */
export function clearTrophyPictures(): void {
  pending.clear();
  ready.clear();
  queue = Promise.resolve();
}
