import type { JSX } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { t } from '../i18n';
import { useAccount } from '../useAccount';
import { AdminLog } from './AdminLog';
import { AdminQuiz } from './AdminQuiz';
import { AdminQuizzes } from './AdminQuizzes';
import { AdminStats } from './AdminStats';
import { AdminUser } from './AdminUser';
import { AdminUsers } from './AdminUsers';

const TABS = [
  { to: '/admin', key: 'adminTabStats', end: true },
  { to: '/admin/users', key: 'adminTabUsers', end: false },
  { to: '/admin/quizzes', key: 'adminTabQuizzes', end: false },
  { to: '/admin/log', key: 'adminTabLog', end: false },
] as const;

/** Гейт: лише адмін; усім іншим — головна. */
export function Admin(): JSX.Element | null {
  const account = useAccount();
  if (account.status === 'loading') return null;
  if (account.status !== 'signed-in' || !account.account.admin) return <Navigate to="/" replace />;
  return (
    <main className="app wide">
      <h1 className="brand">{t('adminTitle')}</h1>
      <nav className="admin-tabs" aria-label={t('adminSections')}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="btn">
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route path="" element={<AdminStats />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUser />} />
        <Route path="quizzes" element={<AdminQuizzes />} />
        <Route path="quizzes/:id" element={<AdminQuiz />} />
        <Route path="log" element={<AdminLog />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </main>
  );
}

/** Спільна пагінація: «Назад» / «Сторінка {page} з {pages}» / «Далі». */
export function AdminPager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }): JSX.Element | null {
  if (pages <= 1) return null;
  return (
    <div className="admin-pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('adminPrev')}
      </button>
      <span className="meta">{t('adminPageOf', { page, pages })}</span>
      <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('adminNext')}
      </button>
    </div>
  );
}
