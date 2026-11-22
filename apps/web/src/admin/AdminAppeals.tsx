import { useEffect, useState, type JSX } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { AdminProblemsBadge } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { ADMIN_BADGE_EVENT } from './Admin';
import { AdminReportedQuiz } from './AdminQuiz';
import { AdminReports } from './AdminReports';
import { PlayerReports, ServerErrors } from './AdminErrors';
import { adminProblemsBadge } from './admin-api';

const COMPLAINTS = '/admin/appeals/complaints';

const VIEWS: { to: string; key: TextKey; count: (badge: AdminProblemsBadge) => number }[] = [
  { to: COMPLAINTS, key: 'adminAppealsComplaints', count: (badge) => badge.complaints },
  { to: '/admin/appeals/problems', key: 'adminAppealsProblems', count: (badge) => badge.reports },
  { to: '/admin/appeals/errors', key: 'adminAppealsErrors', count: (badge) => badge.errors },
];

/** Лічильники підвкладок: перечитуються на кожен перехід і на «Вирішено» / відповідь / дію модерації. */
function useCounts(): AdminProblemsBadge | null {
  const location = useLocation();
  const [counts, setCounts] = useState<AdminProblemsBadge | null>(null);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    const ask = () => setAsked((n) => n + 1);
    window.addEventListener(ADMIN_BADGE_EVENT, ask);
    return () => window.removeEventListener(ADMIN_BADGE_EVENT, ask);
  }, []);
  useEffect(() => {
    let current = true;
    void adminProblemsBadge().then((result) => {
      if (current && result.ok) setCounts(result.data);
    });
    return () => {
      current = false;
    };
  }, [location.key, asked]);
  return counts;
}

/** Голий /admin/appeals: перша підвкладка, де є нове; нового нема чи лічильників не дісталося — перша. */
function AppealsIndex(): JSX.Element | null {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void adminProblemsBadge().then((result) => {
      if (!current) return;
      const first = result.ok ? VIEWS.find((view) => view.count(result.data) > 0) : undefined;
      setTarget(first?.to ?? COMPLAINTS);
    });
    return () => {
      current = false;
    };
  }, []);
  return target === null ? null : <Navigate to={target} replace />;
}

/** Старий адрес картки вікторини зі скарг веде на нову (70). */
export function ReportedQuizRedirect(): JSX.Element {
  const { entryId } = useParams();
  return <Navigate to={`${COMPLAINTS}/quiz/${encodeURIComponent(entryId ?? '')}`} replace />;
}

/** Вкладка «Звернення» (70): скарги на вікторини й профілі, «Щось не працює», збої сервера. */
export function AdminAppeals(): JSX.Element {
  const counts = useCounts();
  return (
    <div className="admin-appeals">
      <nav className="admin-appeals-views" aria-label={t('adminAppealsViews')}>
        {VIEWS.map((view) => {
          const count = counts === null ? 0 : view.count(counts);
          return (
            <NavLink key={view.to} to={view.to} className="btn" aria-label={count > 0 ? t('adminAppealsNew', { label: t(view.key), count }) : undefined}>
              {t(view.key)}
              {count > 0 && (
                <span className="menu-badge" aria-hidden="true">
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <Routes>
        <Route path="" element={<AppealsIndex />} />
        <Route path="complaints" element={<AdminReports />} />
        <Route path="complaints/quiz/:entryId" element={<AdminReportedQuiz />} />
        <Route path="problems" element={<PlayerReports />} />
        <Route path="errors" element={<ServerErrors />} />
        <Route path="*" element={<Navigate to={COMPLAINTS} replace />} />
      </Routes>
    </div>
  );
}
