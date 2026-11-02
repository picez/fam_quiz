import { useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { formatDate } from '../format';
import { t } from '../i18n';
import { AdminPager } from './Admin';
import { adminLog } from './admin-api';
import { logLine } from './admin-text';
import { useAdminData } from './useAdminData';

export function AdminLog(): JSX.Element {
  const [page, setPage] = useState(1);
  const state = useAdminData(() => adminLog(page), String(page));
  if (state.status === 'home') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }
  return (
    <>
      {state.data.rows.length === 0 ? (
        <p className="meta">{t('adminLogEmpty')}</p>
      ) : (
        <ul className="admin-list">
          {state.data.rows.map((entry) => (
            <li key={entry.id} className="admin-card">
              <p className="meta">{formatDate(entry.at)}</p>
              <p>{logLine(entry)}</p>
            </li>
          ))}
        </ul>
      )}
      <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
    </>
  );
}
