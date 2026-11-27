import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { feedBadgeLabel, feedBadgeTotal } from '@quiz/shared';
import { AppearanceMenu } from '../appearance/AppearanceMenu';
import { refreshInbox, useInboxBadge } from '../inbox/useInboxBadge';
import { t, type TextKey } from '../i18n';
import { menuSection, type MenuSection } from '../nav/menu-section';
import { useAccount } from '../useAccount';
import { useFeedBadge } from '../useFeedBadge';
import { useGroupInvites } from '../useGroupInvites';
import { useInvites } from '../useInvites';

/** tight — коротший підпис для шести пунктів (меню адміна) на вузькому екрані. */
type Item = { label: TextKey; short: TextKey; tight?: TextKey; icon: string; to: string; section: MenuSection };

// 77: пʼять пунктів — Головна · Вікторини · Стрічка · Історія · Профіль; що світиться, вирішує menuSection.
const HOME: Item = { label: 'menuJoin', short: 'menuShortJoin', icon: '🏠', to: '/', section: 'home' };
// «Вікторини» — сторінка з вкладками Мої · Бібліотека · Вподобані; світиться й на /library, /create, /help, /challenge.
const QUIZZES: Item = { label: 'menuQuizzes', short: 'menuShortQuizzes', tight: 'menuShortQuizzesTight', icon: '📝', to: '/quizzes', section: 'quizzes' };
const FEED: Item = { label: 'menuFeed', short: 'menuShortFeed', icon: '📰', to: '/feed', section: 'feed' };
const HISTORY: Item = { label: 'menuHistory', short: 'menuShortHistory', icon: '🕘', to: '/history', section: 'history' };
const PROFILE: Item = { label: 'menuProfile', short: 'menuShortProfile', icon: '👤', to: '/profile', section: 'profile' };
// Бібліотека — самостійний пункт лише для гостя; з акаунтом вона — вкладка «Вікторин».
const LIBRARY: Item = { label: 'menuLibrary', short: 'menuShortLibrary', icon: '📚', to: '/library', section: 'quizzes' };

// Адмінка — лише для адміна з акаунтом; останній пункт, світиться на /admin і глибше.
const ADMIN: Item = { label: 'menuAdmin', short: 'menuShortAdmin', icon: '🛠️', to: '/admin', section: 'admin' };

/** Який пункт світиться: гість має з розділу «Вікторини» лише бібліотеку, решта (довідка) — під «Головною». */
function activeItem(items: Item[], pathname: string): Item | null {
  const section = menuSection(pathname);
  if (items.includes(LIBRARY) && section === 'quizzes') return pathname === '/library' || pathname.startsWith('/library/') ? LIBRARY : HOME;
  return items.find((item) => item.section === section) ?? (section === 'inbox' ? null : HOME);
}

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
    section: 'login',
  };
  const items =
    account.status === 'signed-in' ? (account.account.admin ? [HOME, QUIZZES, FEED, HISTORY, PROFILE, ADMIN] : [HOME, QUIZZES, FEED, HISTORY, PROFILE]) : account.status === 'anonymous' ? [HOME, LIBRARY, signIn] : [HOME];
  // 78: поки не відомо, хто тут (завантаження чи збій), не світиться нічого: «Головна» на /quizzes була б неправдою.
  const known = account.status === 'signed-in' || account.status === 'anonymous';
  const active = known ? activeItem(items, location.pathname) : null;
  // 77: у шести пунктах (адмін) «Вікторини» не влазять у шосту частину 320 px — там коротший підпис.
  const short = (item: Item) => t(items.length > 5 && item.tight !== undefined ? item.tight : item.short);

  // 81: слова біля дзвіночка й «Вигляду» — лише коли вміщуються: якщо панель з ними ширша за екран (довгі назви мовою,
  // легкий режим, адмін), клас is-tight лишає самі значки (назви — в aria-label). Перевірка до відмалювання і на кожну зміну ширини.
  const nav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const bar = nav.current;
    if (bar === null) return;
    const fit = () => {
      bar.classList.remove('is-tight');
      if (bar.scrollWidth > bar.clientWidth) bar.classList.add('is-tight');
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(fit);
    watch.observe(bar);
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  });

  const name = (item: Item) =>
    item === PROFILE && total > 0
      ? `${t(item.label)}, ${t('invitesBadge', { count: total })}`
      : item === FEED && feedLabel
        ? `${t(item.label)}, ${t('feedBadge', { count: feedTotal })}`
        : t(item.label);

  return (
    <nav ref={nav} className="menu" aria-label={t('menuLabel')}>
      {items.map((item) => (
        <Link key={item.label} to={item.to} aria-label={name(item)} data-short={short(item)} aria-current={item === active ? 'page' : undefined}>
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
          <span className="menu-word" aria-hidden="true">
            {t('menuInbox')}
          </span>
          {inbox > 0 && (
            <span className="menu-badge" aria-hidden="true">
              {feedBadgeLabel(inbox)}
            </span>
          )}
        </Link>
      )}
      {/* 80: «Вигляд» — тема й легкий режим в одному поповері; лише на компʼютері: на телефоні нижня панель без нього,
          той самий блок — унизу головної й у налаштуваннях профілю. */}
      <AppearanceMenu className="menu-looks" />
    </nav>
  );
}
