import { loadTrophyEngine, webglAvailable } from './loadEngine';
import { trophyLabel, type TrophyLook } from './trophy-meta';

/**
 * Статичні знімки трофеїв (29a) для полиць і списків нагород: один знімок на вигляд (ключ — JSON.stringify(look)),
 * знімки робляться по одному через спільний рендерер рушія, живих WebGL-сцен на сторінці не лишається.
 */
const pending = new Map<string, Promise<string | null>>();
/** Готові знімки: компонент бере їх одразу, без кадру зі значком. */
const ready = new Map<string, string>();
/** Черга: наступний знімок починається, коли попередній закінчився (вдало чи ні). */
let queue: Promise<unknown> = Promise.resolve();

async function shoot(look: TrophyLook): Promise<string | null> {
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

/** Готовий знімок вигляду, якщо він уже є. */
export const readyPicture = (look: TrophyLook): string | null => ready.get(pictureKey(look)) ?? null;

/**
 * Знімок вигляду: data URL або null (без WebGL, рушій не завантажився, модель не прийшла). Рівні вигляди діляться
 * одним знімком; null не кешується — наступний показ спробує знову.
 */
export function trophyPicture(look: TrophyLook): Promise<string | null> {
  const key = pictureKey(look);
  const known = pending.get(key);
  if (known !== undefined) return known;
  const next = queue.then(() => shoot(look));
  queue = next;
  pending.set(key, next);
  void next.then((url) => {
    if (url === null) pending.delete(key);
    else ready.set(key, url);
  });
  return next;
}

/** Лише для тестів: забути всі знімки. */
export function clearTrophyPictures(): void {
  pending.clear();
  ready.clear();
  queue = Promise.resolve();
}
