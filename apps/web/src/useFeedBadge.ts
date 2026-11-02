import { useEffect, useState } from 'react';
import { FEED_POLL_MS, type FeedBadge } from '@quiz/shared';
import { getFeedBadge } from './api';

export const FEED_CHANGED = 'quiz:feed-changed';

const ZERO: FeedBadge = { events: 0, requests: 0, decisions: 0 };

/** Сторінка стрічки щойно позначила переглянуте: бейдж перечитується. */
export function announceFeedSeen(): void {
  window.dispatchEvent(new Event(FEED_CHANGED));
}

/**
 * Бейдж стрічки: запит на старті, за зміною refresh, кожні FEED_POLL_MS при видимій вкладці, на visibilitychange
 * і FEED_CHANGED. Вимкнено чи ще невідомо — нулі. Помилка лишає попереднє значення.
 */
export function useFeedBadge(enabled: boolean, refresh?: unknown): FeedBadge {
  const [badge, setBadge] = useState<FeedBadge>(ZERO);
  useEffect(() => {
    if (!enabled) {
      setBadge(ZERO);
      return;
    }
    let current = true;
    const load = () => {
      void getFeedBadge().then((result) => {
        if (current && result.ok) setBadge({ events: result.events, requests: result.requests, decisions: result.decisions });
      });
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') load();
    }, FEED_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener(FEED_CHANGED, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      clearInterval(timer);
      window.removeEventListener(FEED_CHANGED, load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return enabled ? badge : ZERO;
}
