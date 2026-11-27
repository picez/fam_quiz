import { matchPath } from 'react-router-dom';
import { t, type TextKey } from '../i18n';

/** Ігрові екрани (телефон гравця, пульт, сцена, бот-ведучий): власна поведінка, без заголовка сторінки й без прокрутки оболонки. */
const GAME = ['/play/:code', '/host/:code', '/stage/:code', '/bot-host/:code'];

/** Назва кожної сторінки поза грою; порядок — як у AppRoutes (статичні сегменти раніше за :id). */
const TITLES: [pattern: string, key: TextKey][] = [
  ['/', 'pageHome'],
  ['/login', 'loginTitle'],
  ['/create', 'startCreate'],
  ['/quizzes', 'quizzesTitle'],
  ['/quizzes/new', 'editorNew'],
  ['/quizzes/liked', 'quizzesLikedTitle'],
  ['/quizzes/:id', 'editorEdit'],
  ['/library', 'libraryTitle'],
  ['/library/:id', 'libraryTitle'],
  ['/feed', 'menuFeed'],
  ['/feed/calendar', 'feedTabCalendar'],
  ['/history', 'historyTitle'],
  ['/history/:id', 'historyTitle'],
  ['/me', 'myGamesTitle'],
  ['/profile', 'menuProfile'],
  ['/profile/quizzes', 'profileTileQuizzes'],
  ['/profile/prizes/*', 'profileTilePrizes'],
  ['/prizes', 'profileTilePrizes'],
  ['/profile/achievements', 'profileTileAchievements'],
  ['/achievements', 'profileTileAchievements'],
  ['/profile/friends', 'profileTileFriends'],
  ['/friends', 'profileTileFriends'],
  ['/profile/stats', 'profileTileStats'],
  ['/profile/levels', 'levelMapTitle'],
  ['/profile/looks', 'profileTileLooks'],
  ['/profile/settings', 'profileTileSettings'],
  ['/profile/groups/*', 'profileTileGroups'],
  ['/groups', 'profileTileGroups'],
  ['/groups/join/:code', 'groupJoinTitle'],
  ['/challenge/:code', 'challengeTitle'],
  ['/profile/:id/achievements', 'profileTileAchievements'],
  ['/profile/:id', 'menuProfile'],
  ['/admin/*', 'adminTitle'],
  ['/help', 'helpTitle'],
  ['/report', 'problemLink'],
  ['/inbox', 'inboxTitle'],
];

export function isGamePath(pathname: string): boolean {
  return GAME.some((pattern) => matchPath(pattern, pathname) !== null);
}

/** Назва сторінки мовою інтерфейсу («Друзі»); null — ігровий екран чи невідома адреса. */
export function pageTitle(pathname: string): string | null {
  if (isGamePath(pathname)) return null;
  const found = TITLES.find(([pattern]) => matchPath(pattern, pathname) !== null);
  return found === undefined ? null : t(found[1]);
}

/** Заголовок вкладки: «Сторінка · Вікторина»; без сторінки (головна, гра) — лише назва сайту. */
export function documentTitle(page: string | null): string {
  return page === null ? t('appName') : `${page} · ${t('appName')}`;
}

/** Заголовок вкладки для адреси: головна й ігрові екрани — назва сайту. */
export function documentTitleFor(pathname: string): string {
  return documentTitle(pathname === '/' ? null : pageTitle(pathname));
}

/**
 * Сторінки, що поводяться як вкладки однієї сторінки: перемикання між ними не переносить фокус на заголовок.
 * Адмінка — лише її розділи першого рівня (/admin/users), картки глибше (/admin/users/1) — окремі сторінки.
 */
export function tabGroup(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/feed' || path === '/feed/calendar') return 'feed';
  if (path === '/history' || path === '/me') return 'history';
  // 77: вкладки «Вікторин» — Мої · Бібліотека · Вподобані.
  if (path === '/quizzes' || path === '/library' || path === '/quizzes/liked') return 'quizzes';
  if (path === '/admin' || /^\/admin\/[^/]+$/.test(path) || path.startsWith('/admin/appeals')) return 'admin';
  return null;
}
