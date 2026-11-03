import { useState, type FormEvent, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { AdminUserRow } from '@quiz/shared';
import { formatDate } from '../format';
import { t } from '../i18n';
import { AdminPager } from './Admin';
import { adminUsers } from './admin-api';
import { useAdminData } from './useAdminData';
import { nickText } from '../nick';

/** Картка людини: у списку з посиланням на людину, на сторінці людини без нього. */
export function UserCard({ row, link }: { row: AdminUserRow; link: boolean }): JSX.Element {
  return (
    <li className="admin-card">
      <h2>{link ? <Link to={`/admin/users/${encodeURIComponent(row.id)}`}>{nickText(row.nickname)}</Link> : nickText(row.nickname)}</h2>
      <p className="meta">{row.email}</p>
      <p className="meta">{t('adminJoined', { date: formatDate(row.createdAt) })}</p>
      <p className="meta">{t('adminGamesCount', { count: row.games })}</p>
      <p className="meta">{t('adminQuizzesCount', { count: row.quizzes })}</p>
      {row.admin && <p className="admin-mark">{t('adminIsAdmin')}</p>}
      {row.banned !== null && <p className="admin-mark is-banned">{t('adminBanned', { date: formatDate(row.banned.at) })}</p>}
    </li>
  );
}

export function AdminUsers(): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const state = useAdminData(() => adminUsers(query, page), `${query}:${page}`);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draft.trim());
    setPage(1);
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <form className="admin-search" onSubmit={search}>
        <label className="field">
          <span>{t('adminSearchUsers')}</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} />
        </label>
        <button type="submit" className="btn">
          {t('adminSearch')}
        </button>
      </form>
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn" onClick={state.reload}>
            {t('prizesRetry')}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          {state.data.rows.length === 0 ? (
            <p className="meta">{t('adminNothing')}</p>
          ) : (
            <ul className="admin-list">
              {state.data.rows.map((row) => (
                <UserCard key={row.id} row={row} link />
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
