import { useCallback, useRef, useState } from 'react';
import { normalizeFavorites, toggleFavorite } from '@quiz/shared';
import { getFavoriteStickers, saveFavoriteStickers } from '../api';

export const GUEST_FAVORITES_KEY = 'quiz:stickers:favorites';

type Owner = 'guest' | 'account';

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

/**
 * Улюблені стікери (13a). Вантажить на першому load(): 401 — гість (localStorage, JSON-масив, normalizeFavorites), інакше — акаунт
 * (/api/me/stickers). toggle одразу оновлює список через toggleFavorite (не більше 40); збій збереження акаунта мовчки повертає попередній.
 */
export function useFavoriteStickers(): { favorites: string[]; load: () => void; toggle: (id: string) => void } {
  const [favorites, setFavorites] = useState<string[]>([]);
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
        return 'account';
      }
      if (result.error === 'unauthorized') {
        set(readGuest());
        return 'guest';
      }
      // Збій мережі: наступне відкриття аркуша спробує ще раз.
      ownerRef.current = null;
      return 'account';
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

  return { favorites, load, toggle };
}
