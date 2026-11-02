import { feedBadgeLabel, type FeedBadge } from '@quiz/shared';
import { NavLink } from 'react-router-dom';
import { t, type TextKey } from '../i18n';

export interface FeedTab {
  to: string;
  label: TextKey;
  badge: (b: FeedBadge) => number;
}

/** #21 допише вкладку «Календар». */
export const FEED_TABS: FeedTab[] = [{ to: '/feed', label: 'feedTabFriends', badge: (b) => b.events }];

export function FeedTabs({ badge }: { badge: FeedBadge }) {
  return (
    <nav className="history-tabs" aria-label={t('menuFeed')}>
      {FEED_TABS.map((tab) => {
        const count = tab.badge(badge);
        const text = feedBadgeLabel(count);
        return (
          <NavLink key={tab.to} to={tab.to} end>
            {t(tab.label)}
            {text !== null && (
              <span className="menu-badge" aria-label={t('feedBadge', { count })}>
                {text}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
