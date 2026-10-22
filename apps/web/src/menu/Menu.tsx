import { Link, useLocation } from 'react-router-dom';
import { t, type TextKey } from '../i18n';
import { useAccount } from '../useAccount';

type Item = { label: TextKey; icon: string; to: string; active: (path: string) => boolean };

const under = (base: string) => (path: string) => path === base || path.startsWith(`${base}/`);

const JOIN: Item = { label: 'menuJoin', icon: '🎮', to: '/', active: (path) => path === '/' };
const QUIZZES: Item = { label: 'menuQuizzes', icon: '📝', to: '/quizzes', active: under('/quizzes') };
const HISTORY: Item = { label: 'menuHistory', icon: '🕘', to: '/history', active: (path) => under('/history')(path) || path === '/me' };
const PROFILE: Item = { label: 'menuProfile', icon: '👤', to: '/profile', active: under('/profile') };

export function Menu() {
  const location = useLocation();
  const account = useAccount(location.key);
  const signIn: Item = {
    label: 'menuSignIn',
    icon: '🔑',
    to: location.pathname === '/login' ? `/login${location.search}` : `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    active: (path) => path === '/login',
  };
  const items =
    account.status === 'signed-in' ? [JOIN, QUIZZES, HISTORY, PROFILE] : account.status === 'anonymous' ? [JOIN, signIn] : [JOIN];

  return (
    <nav className="menu" aria-label={t('menuLabel')}>
      {items.map((item) => (
        <Link key={item.label} to={item.to} aria-current={item.active(location.pathname) ? 'page' : undefined}>
          <span aria-hidden="true">{item.icon}</span>
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}
