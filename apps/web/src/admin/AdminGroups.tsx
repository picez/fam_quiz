import { useState, type FormEvent, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ADMIN_QUERY_MAX, type AdminGroupRow } from '@quiz/shared';
import { formatDate } from '../format';
import { countText, t } from '../i18n';
import { nickText } from '../nick';
import { AdminPager } from './Admin';
import { adminGroups } from './admin-api';
import { useAdminData } from './useAdminData';

/** Рядок групи: у списку — посилання на картку, на картці — заголовок без посилання. */
export function GroupRowCard({ row, link }: { row: AdminGroupRow; link: boolean }): JSX.Element {
  const title = `${row.emoji} ${row.name}`;
  return (
    <li className="admin-card admin-group-card">
      <h2 dir="auto">{link ? <Link to={`/admin/groups/${encodeURIComponent(row.id)}`}>{title}</Link> : title}</h2>
      <p className="meta" dir="auto">
        {row.owner === null ? t('adminGroupNoOwner') : t('adminGroupOwner', { name: nickText(row.owner.nickname) })}
      </p>
      <p className="meta">
        <span>{countText('adminGroupMembers', row.members, { count: row.members })}</span> · <span>{countText('groupItems', row.items, { count: row.items })}</span>
      </p>
      <p className="meta">{formatDate(row.createdAt)}</p>
      {row.hidden !== null && <p className="admin-mark is-banned">{t('adminGroupHidden')}</p>}
      {!link && row.hidden?.reason && (
        <p className="meta" dir="auto">
          {t('adminReasonShown', { reason: row.hidden.reason })}
        </p>
      )}
    </li>
  );
}

/** «Групи» (63): пошук сімейних груп за назвою чи ніком власника, новіші першими. */
export function AdminGroups(): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const state = useAdminData(() => adminGroups({ q: query, page }), `${query}:${page}`);

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
          <span>{t('adminSearchGroups')}</span>
          <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={ADMIN_QUERY_MAX} />
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
            <p className="meta">{t('adminGroupsEmpty')}</p>
          ) : (
            <ul className="admin-list">
              {state.data.rows.map((row) => (
                <GroupRowCard key={row.id} row={row} link />
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
