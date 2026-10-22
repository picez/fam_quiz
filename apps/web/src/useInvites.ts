import { useEffect, useState } from 'react';
import type { GameInvite } from '@quiz/shared';
import { getMyInvites } from './api';

export const INVITES_POLL_MS = 30_000;
export const INVITES_CHANGED = 'quiz:invites-changed';

/** Повідомляє всі хуки useInvites, що запрошення змінилися (наприклад, після відхилення). */
export function announceInvitesChanged(): void {
  window.dispatchEvent(new Event(INVITES_CHANGED));
}

/**
 * Запрошення того, хто увійшов: запит на старті, за зміною refresh, кожні INVITES_POLL_MS при видимій вкладці
 * і за INVITES_CHANGED. Вимкнено — []. Помилка лишає попередній список.
 */
export function useInvites(enabled: boolean, refresh?: unknown): GameInvite[] {
  const [invites, setInvites] = useState<GameInvite[]>([]);
  useEffect(() => {
    if (!enabled) {
      setInvites([]);
      return;
    }
    let current = true;
    const load = () => {
      void getMyInvites().then((result) => {
        if (current && result.ok) setInvites(result.data);
      });
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') load();
    }, INVITES_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener(INVITES_CHANGED, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      clearInterval(timer);
      window.removeEventListener(INVITES_CHANGED, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return enabled ? invites : [];
}
