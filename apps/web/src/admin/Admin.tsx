import { useEffect, useRef, useState, type JSX, type Ref } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { reducedMotion } from '../motion';
import { useAccount } from '../useAccount';
import { AdminAnnouncement } from './AdminAnnouncement';
import { AdminBackups } from './AdminBackups';
import { AdminBot } from './AdminBot';
import { AdminBroadcast } from './AdminBroadcast';
import { AdminErrors } from './AdminErrors';
import { AdminFeed } from './AdminFeed';
import { AdminGame } from './AdminGame';
import { AdminGroup } from './AdminGroup';
import { AdminGroups } from './AdminGroups';
import { AdminLive } from './AdminLive';
import { AdminLog } from './AdminLog';
import { AdminBotQuizView, AdminQuiz, AdminReportedQuiz } from './AdminQuiz';
import { AdminQuizzes } from './AdminQuizzes';
import { AdminReplay } from './AdminReplay';
import { AdminReports } from './AdminReports';
import { AdminStats } from './AdminStats';
import { AdminUser } from './AdminUser';
import { AdminUsers } from './AdminUsers';
import { adminProblemsBadge } from './admin-api';

const TABS = [
  { to: '/admin', key: 'adminTabStats', end: true },
  { to: '/admin/live', key: 'adminTabLive', end: false },
  { to: '/admin/users', key: 'adminTabUsers', end: false },
  { to: '/admin/quizzes', key: 'adminTabQuizzes', end: false },
  { to: '/admin/reports', key: 'adminTabReports', end: false },
  { to: '/admin/announcement', key: 'adminTabAnnouncement', end: false },
  { to: '/admin/broadcast', key: 'adminTabBroadcast', end: false },
  { to: '/admin/feed', key: 'adminTabFeed', end: false },
  { to: '/admin/groups', key: 'adminTabGroups', end: false },
  { to: '/admin/log', key: 'adminTabLog', end: false },
  { to: '/admin/errors', key: 'adminTabErrors', end: false },
  { to: '/admin/backups', key: 'adminTabBackups', end: false },
  { to: '/admin/bot', key: 'adminTabBot', end: false },
] as const;

const ADMIN_BADGE_EVENT = 'admin-badge';

/** Просить вкладки перечитати бейдж «Збоїв» (64): після «Вирішено» чи відповіді, без переходу. */
export function refreshAdminBadge(): void {
  window.dispatchEvent(new Event(ADMIN_BADGE_EVENT));
}

/** Вкладки адмінки; на «Збоях» — бейдж нових збоїв і відкритих скарг (64), перечитується на кожен перехід і на refreshAdminBadge. */
function AdminTabs({ navRef }: { navRef: Ref<HTMLElement> }): JSX.Element {
  const location = useLocation();
  const [fresh, setFresh] = useState(0);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    const ask = () => setAsked((n) => n + 1);
    window.addEventListener(ADMIN_BADGE_EVENT, ask);
    return () => window.removeEventListener(ADMIN_BADGE_EVENT, ask);
  }, []);
  useEffect(() => {
    let current = true;
    void adminProblemsBadge().then((result) => {
      if (current && result.ok) setFresh(result.data.errors + result.data.reports);
    });
    return () => {
      current = false;
    };
  }, [location.key, asked]);
  return (
    <nav ref={navRef} className="admin-tabs" aria-label={t('adminSections')}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className="btn">
          {t(tab.key)}
          {tab.key === 'adminTabErrors' && fresh > 0 && (
            <span className="menu-badge" aria-label={t('adminTabErrorsBadge', { count: fresh })}>
              {fresh}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Гейт: лише адмін; усім іншим — головна. */
export function Admin(): JSX.Element | null {
  const account = useAccount();
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const shown = account.status === 'signed-in' && account.account.admin;
  // 63: вкладки — один рядок, що гортається вбік; активна завжди в полі зору (nearest працює й у RTL).
  useEffect(() => {
    if (!shown || nav.current === null) return;
    // Смуга поза екраном по вертикалі (перехід із глибини сторінки) — сторінку не смикаємо.
    const box = nav.current.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return;
    nav.current
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [pathname, shown]);
  if (account.status === 'loading') return null;
  if (account.status !== 'signed-in' || !account.account.admin) return <Navigate to="/" replace />;
  return (
    <main className="app wide admin-page">
      <h1 className="brand">{t('adminTitle')}</h1>
      <AdminTabs navRef={nav} />
      <div className="admin-body">
      <Routes>
        <Route path="" element={<AdminStats />} />
        <Route path="live" element={<AdminLive />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUser />} />
        <Route path="games/:id" element={<AdminGame />} />
        <Route path="games/:id/replay" element={<AdminReplay />} />
        <Route path="quizzes" element={<AdminQuizzes />} />
        <Route path="quizzes/:id" element={<AdminQuiz />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="reports/quiz/:entryId" element={<AdminReportedQuiz />} />
        <Route path="announcement" element={<AdminAnnouncement />} />
        <Route path="broadcast" element={<AdminBroadcast />} />
        <Route path="feed" element={<AdminFeed />} />
        <Route path="groups" element={<AdminGroups />} />
        <Route path="groups/:id" element={<AdminGroup />} />
        <Route path="log" element={<AdminLog />} />
        <Route path="errors" element={<AdminErrors />} />
        <Route path="backups" element={<AdminBackups />} />
        <Route path="bot" element={<AdminBot />} />
        <Route path="bot/quizzes/:id" element={<AdminBotQuizView />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      </div>
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
