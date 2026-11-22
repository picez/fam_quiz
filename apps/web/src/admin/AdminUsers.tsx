import { useState, type FormEvent, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { AdminUserRow } from '@quiz/shared';
import { formatDate } from '../format';
import { t } from '../i18n';
import { AdminPager } from './Admin';
import { adminUsers } from './admin-api';
import { useAdminData } from './useAdminData';
import { nickText } from '../nick';

/** 69: рядок списку — нік (посилання, весь рядок клікабельний), дата реєстрації, email; бейджі «Адмін» / «Заблоковано» не додають рядка. */
function UserRow({ row }: { row: AdminUserRow }): JSX.Element {
  return (
    <li className="admin-user-row">
      <span className="admin-user-nick">
        <Link to={`/admin/users/${encodeURIComponent(row.id)}`}>{nickText(row.nickname)}</Link>
        {row.admin && <span className="admin-mark">{t('adminIsAdmin')}</span>}
        {row.banned !== null && <span className="admin-mark is-banned">{t('adminBannedShort')}</span>}
      </span>
      <time className="admin-user-date meta" dateTime={row.createdAt}>
        {formatDate(row.createdAt)}
      </time>
      <span className="admin-user-email meta" dir="ltr">
        {row.email}
      </span>
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
            <ul className="admin-user-rows">
              {state.data.rows.map((row) => (
                <UserRow key={row.id} row={row} />
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
