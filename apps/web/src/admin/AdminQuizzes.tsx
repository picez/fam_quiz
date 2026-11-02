import { useState, type FormEvent, type JSX } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { countText, errorText, t } from '../i18n';
import { AdminPager } from './Admin';
import { adminQuizzes, deleteQuizAsAdmin } from './admin-api';
import { useAdminData } from './useAdminData';

export function AdminQuizzes(): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useAdminData(() => adminQuizzes(query, page), `${query}:${page}`);
  const navigate = useNavigate();

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draft.trim());
    setPage(1);
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(t('adminDeleteQuizConfirm', { title }))) return;
    setBusy(true);
    setError(null);
    const result = await deleteQuizAsAdmin(id);
    setBusy(false);
    if (result.ok) state.reload();
    else if (result.error === 'not_found') navigate('/', { replace: true });
    else setError(errorText(result.error));
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <form className="admin-search" onSubmit={search}>
        <label className="field">
          <span>{t('adminSearchQuizzes')}</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} />
        </label>
        <button type="submit" className="btn">
          {t('adminSearch')}
        </button>
      </form>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
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
                <li key={row.id} className="admin-card">
                  <h2>{row.title}</h2>
                  <p className="meta">
                    {t('adminAuthor', { name: row.author.nickname })}
                    {row.authorBanned && ` (${t('adminAuthorBanned')})`}
                  </p>
                  <p className="meta">{countText('questionCount', row.questionCount)}</p>
                  <p className="meta">{t('adminGamesOf', { count: row.games })}</p>
                  <div className="admin-actions">
                    <Link className="btn" to={`/admin/quizzes/${encodeURIComponent(row.id)}`}>
                      {t('adminView')}
                    </Link>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove(row.id, row.title)}>
                      {t('adminDeleteQuiz')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
