import { Link, useLocation } from 'react-router-dom';
import { feedBadgeLabel, feedBadgeTotal } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { useAccount } from '../useAccount';
import { useFeedBadge } from '../useFeedBadge';
import { useGroupInvites } from '../useGroupInvites';
import { useInvites } from '../useInvites';

type Item = { label: TextKey; short: TextKey; icon: string; to: string; active: (path: string) => boolean };

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);

const JOIN: Item = { label: 'menuJoin', short: 'menuShortJoin', icon: '🎮', to: '/', active: (path) => path === '/' };
const FEED: Item = { label: 'menuFeed', short: 'menuShortFeed', icon: '📰', to: '/feed', active: under('/feed') };
const QUIZZES: Item = { label: 'menuQuizzes', short: 'menuShortQuizzes', icon: '📝', to: '/quizzes', active: under('/quizzes') };
const HISTORY: Item = { label: 'menuHistory', short: 'menuShortHistory', icon: '🕘', to: '/history', active: (path) => under('/history')(path) || path === '/me' };
const PROFILE: Item = { label: 'menuProfile', short: 'menuShortProfile', icon: '👤', to: '/profile', active: (path) => ['/profile', '/prizes', '/achievements', '/friends', '/groups'].some((base) => under(base)(path)) };

export function Menu() {
  const location = useLocation();
  const account = useAccount(location.key);
  const invites = useInvites(account.status === 'signed-in', location.key);
  const groupInvites = useGroupInvites(account.status === 'signed-in', location.key);
  // Бейдж «Профілю»: запрошення в гру і в групи (12k).
  const total = invites.length + groupInvites.length;
  const feed = useFeedBadge(account.status === 'signed-in');
  const feedTotal = feedBadgeTotal(feed);
  const feedLabel = feedBadgeLabel(feedTotal);
  const signIn: Item = {
    label: 'menuSignIn', short: 'menuShortSignIn',
    icon: '🔑',
    to: location.pathname === '/login' ? `/login${location.search}` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    active: (path) => path === '/login',
  };
  const items =
    account.status === 'signed-in' ? [JOIN, FEED, QUIZZES, HISTORY, PROFILE] : account.status === 'anonymous' ? [JOIN, signIn] : [JOIN];

  const name = (item: Item) =>
    item === PROFILE && total > 0
      ? `${t(item.label)}, ${t('invitesBadge', { count: total })}`
      : item === FEED && feedLabel
        ? `${t(item.label)}, ${t('feedBadge', { count: feedTotal })}`
        : t(item.label);

  return (
    <nav className="menu" aria-label={t('menuLabel')}>
      {items.map((item) => (
        <Link key={item.label} to={item.to} aria-label={name(item)} data-short={t(item.short)} aria-current={item.active(location.pathname) ? 'page' : undefined}>
          <span aria-hidden="true">{item.icon}</span>
          <span className="menu-full">{t(item.label)}</span>
          {item === PROFILE && total > 0 && (
            <span className="menu-badge" aria-hidden="true">
              {total}
            </span>
          )}
          {item === FEED && feedLabel && (
            <span className="menu-badge" aria-hidden="true">
              {feedLabel}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
