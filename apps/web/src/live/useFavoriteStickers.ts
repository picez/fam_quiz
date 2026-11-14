import { useCallback, useRef, useState } from 'react';
import { normalizeFavorites, STICKER_PACKS, toggleFavorite, type StickerExtra, type StickerPackId } from '@quiz/shared';
import { getFavoriteStickers, saveFavoriteStickers } from '../api';

export const GUEST_FAVORITES_KEY = 'quiz:stickers:favorites';

/** unknown — список не вдалося прочитати (мережа, 5xx): такий список не зберігається ніде. */
type Owner = 'guest' | 'account' | 'unknown';

/** Список гостя з localStorage: JSON-масив рядків, інакше (сміття, немає сховища) — []. */
function readGuest(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY) ?? '[]');
    return Array.isArray(parsed) ? normalizeFavorites(parsed.filter((id): id is string => typeof id === 'string')) : [];
  } catch {
    return [];
  }
}

function writeGuest(list: string[]): void {
  try {
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(list));
  } catch {
    // Сховище недоступне (приватний режим): улюблені живуть до закриття вкладки.
  }
}

/** Доступ до стікерів з відповіді (34): невідомі набори й кривий рівень відкидаються; старий сервер — {}. */
function accessOf(body: { packs?: unknown; legacyLevel?: unknown }): StickerExtra {
  const access: StickerExtra = {};
  if (Array.isArray(body.packs)) access.packs = body.packs.filter((p): p is StickerPackId => typeof p === 'string' && (STICKER_PACKS as readonly string[]).includes(p));
  if (typeof body.legacyLevel === 'number' && Number.isInteger(body.legacyLevel) && body.legacyLevel >= 1) access.legacyLevel = body.legacyLevel;
  return access;
}

/**
 * Улюблені стікери (13a) і доступ до них понад рівень (34: access — набори за досягнення й рівень успадкування; гість і «невідомо» — {}). Вантажить на першому load(): 401 — гість (localStorage, JSON-масив, normalizeFavorites), ok — акаунт
 * (/api/me/stickers), інший збій — невідомо: ☆ нічого не міняє й не зберігає, доки список не прочитано. toggle одразу оновлює список через toggleFavorite (не більше 40); збій збереження акаунта мовчки повертає попередній.
 */
export function useFavoriteStickers(): { favorites: string[]; access: StickerExtra; load: () => void; toggle: (id: string) => void } {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [access, setAccess] = useState<StickerExtra>({});
  const listRef = useRef<string[]>([]);
  const ownerRef = useRef<Promise<Owner> | null>(null);

  const set = useCallback((next: string[]) => {
    listRef.current = next;
    setFavorites(next);
  }, []);

  const start = useCallback((): Promise<Owner> => {
    if (ownerRef.current !== null) return ownerRef.current;
    const pending = getFavoriteStickers().then((result): Owner => {
      if (result.ok) {
        set(normalizeFavorites(result.favorites));
        setAccess(accessOf(result));
        return 'account';
      }
      if (result.error === 'unauthorized') {
        set(readGuest());
        return 'guest';
      }
      // Збій мережі чи сервера: наступне відкриття аркуша (чи дотик ☆) спробує ще раз.
      ownerRef.current = null;
      return 'unknown';
    });
    ownerRef.current = pending;
    return pending;
  }, [set]);

  const load = useCallback(() => {
    void start();
  }, [start]);

  const toggle = useCallback(
    (id: string) => {
      void start().then(async (owner) => {
        // Список, який не прочитали з сервера, не можна зберегти: PUT [id] затер би до 40 улюблених профілю.
        if (owner === 'unknown') return;
        const previous = listRef.current;
        const next = toggleFavorite(previous, id);
        set(next);
        if (owner === 'guest') {
          writeGuest(next);
          return;
        }
        const saved = await saveFavoriteStickers(next);
        // Повертаємо попередній, лише якщо поверх не встиг лягти новіший дотик.
        if (!saved.ok && listRef.current === next) set(previous);
      });
    },
    [start, set],
  );

  return { favorites, access, load, toggle };
}
