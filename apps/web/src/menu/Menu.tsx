import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { feedBadgeLabel, feedBadgeTotal } from '@quiz/shared';
import { refreshInbox, useInboxBadge } from '../inbox/useInboxBadge';
import { t, type TextKey } from '../i18n';
import { ThemeToggle } from '../ThemeToggle';
import { useAccount } from '../useAccount';
import { useFeedBadge } from '../useFeedBadge';
import { useGroupInvites } from '../useGroupInvites';
import { useInvites } from '../useInvites';

type Item = { label: TextKey; short: TextKey; icon: string; to: string; active: (path: string) => boolean };

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);

const JOIN: Item = { label: 'menuJoin', short: 'menuShortJoin', icon: '🎮', to: '/', active: (path) => path === '/' };
const FEED: Item = { label: 'menuFeed', short: 'menuShortFeed', icon: '📰', to: '/feed', active: under('/feed') };
// Бібліотека — самостійний пункт лише для гостя; з акаунтом лишається п'ять пунктів, а «Мої вікторини» світяться й на /library.
const QUIZZES: Item = { label: 'menuQuizzes', short: 'menuShortQuizzes', icon: '📝', to: '/quizzes', active: (path) => under('/quizzes')(path) || under('/library')(path) };
const LIBRARY: Item = { label: 'menuLibrary', short: 'menuShortLibrary', icon: '📚', to: '/library', active: under('/library') };
const HISTORY: Item = { label: 'menuHistory', short: 'menuShortHistory', icon: '🕘', to: '/history', active: (path) => under('/history')(path) || path === '/me' };
const PROFILE: Item = { label: 'menuProfile', short: 'menuShortProfile', icon: '👤', to: '/profile', active: (path) => ['/profile', '/prizes', '/achievements', '/friends', '/groups'].some((base) => under(base)(path)) };

// Адмінка — лише для адміна з акаунтом; останній пункт, світиться на /admin і глибше.
const ADMIN: Item = { label: 'menuAdmin', short: 'menuShortAdmin', icon: '🛠️', to: '/admin', active: under('/admin') };

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
  // 70: «Вхідні» — дзвіночок для акаунта; лічильник перечитується на кожен перехід (не частіше за раз на 5 с).
  const signedIn = account.status === 'signed-in';
  const inbox = useInboxBadge(signedIn);
  useEffect(() => {
    if (signedIn) void refreshInbox();
  }, [signedIn, location.key]);
  const signIn: Item = {
    label: 'menuSignIn', short: 'menuShortSignIn',
    icon: '🔑',
    to: location.pathname === '/login' ? `/login${location.search}` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    active: (path) => path === '/login',
  };
  const items =
    account.status === 'signed-in' ? (account.account.admin ? [JOIN, FEED, QUIZZES, HISTORY, PROFILE, ADMIN] : [JOIN, FEED, QUIZZES, HISTORY, PROFILE]) : account.status === 'anonymous' ? [JOIN, LIBRARY, signIn] : [JOIN];

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
      {signedIn && (
        <Link
          className="menu-inbox"
          to="/inbox"
          aria-label={inbox > 0 ? t('menuInboxBadge', { count: inbox }) : t('menuInbox')}
          aria-current={location.pathname === '/inbox' ? 'page' : undefined}
        >
          <span aria-hidden="true">🔔</span>
          {inbox > 0 && (
            <span className="menu-badge" aria-hidden="true">
              {feedBadgeLabel(inbox)}
            </span>
          )}
        </Link>
      )}
      {/* Швидкий перемикач теми: на кожній сторінці з меню; повний вибір (з «Як у системі») — у налаштуваннях профілю. */}
      <ThemeToggle className="menu-theme" />
    </nav>
  );
}
