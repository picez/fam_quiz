import { useEffect, useState } from 'react';
import type { GroupInviteCard } from '@quiz/shared';
import { getGroupInvites } from './api';
import { INVITES_POLL_MS } from './useInvites';

export const GROUP_INVITES_CHANGED = 'quiz:group-invites-changed';

/** Повідомляє всі хуки useGroupInvites, що запрошення в групи змінилися (прийняли, відхилили). */
export function announceGroupInvitesChanged(): void {
  window.dispatchEvent(new Event(GROUP_INVITES_CHANGED));
}

/**
 * Запрошення в групи (12k), як useInvites: запит на старті, за зміною refresh, кожні INVITES_POLL_MS при видимій вкладці
 * і за GROUP_INVITES_CHANGED. Вимкнено — []. Помилка лишає попередній список.
 */
export function useGroupInvites(enabled: boolean, refresh?: unknown): GroupInviteCard[] {
  const [invites, setInvites] = useState<GroupInviteCard[]>([]);
  useEffect(() => {
    if (!enabled) {
      setInvites([]);
      return;
    }
    let current = true;
    const load = () => {
      void getGroupInvites().then((result) => {
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
    window.addEventListener(GROUP_INVITES_CHANGED, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      clearInterval(timer);
      window.removeEventListener(GROUP_INVITES_CHANGED, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return enabled ? invites : [];
}
