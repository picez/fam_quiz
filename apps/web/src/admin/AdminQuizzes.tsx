import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { parseQuizSort } from '@quiz/shared';
import { quizDatesText, quizSizeText } from '../format';
import { countText, errorText, t } from '../i18n';
import { QuizSortField } from '../quiz-folders/QuizSortField';
import { AdminPager } from './Admin';
import { adminQuizzes, deleteQuizAsAdmin } from './admin-api';
import { QuizCheckButton } from './QuizCheck';
import { useAdminData } from './useAdminData';
import { nickText } from '../nick';

export function AdminQuizzes(): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 73: порядок живе в адресі вкладки; типовий («Нещодавно змінені») з неї прибирається.
  const [params, setParams] = useSearchParams();
  const sortParam = params.get('sort');
  const sort = parseQuizSort(sortParam);
  const state = useAdminData(() => adminQuizzes(query, page, sort), `${query}:${page}:${sort}`);
  const navigate = useNavigate();

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draft.trim());
    setPage(1);
  };

  const changeSort = (next: string) => {
    setPage(1);
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (parseQuizSort(next) === 'changed') copy.delete('sort');
        else copy.set('sort', next);
        return copy;
      },
      { replace: true },
    );
  };

  // Невідомий чи типовий порядок в адресі — прибрати.
  useEffect(() => {
    if (sortParam !== null && (sortParam !== sort || sort === 'changed')) changeSort('changed');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- changeSort новий щорендеру, а потрібна лише зміна адреси
  }, [sortParam, sort]);

  const remove = async (id: string, title: string, author: string) => {
    if (!window.confirm(t('adminDeleteQuizConfirm', { title, author }))) return;
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
        <QuizSortField sort={sort} onChange={changeSort} className="admin-quiz-sort" />
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
                  <h2 dir="auto">{row.title}</h2>
                  <p className="meta">
                    {t('adminAuthor', { name: nickText(row.author.nickname) })}
                    {row.authorBanned && ` (${t('adminAuthorBanned')})`}
                  </p>
                  <p className="meta quiz-dates">
                    <time dateTime={row.createdAt}>{quizDatesText(row)}</time>
                  </p>
                  <p className="meta">{quizSizeText(countText('questionCount', row.questionCount, { count: row.questionCount }),row.questionCount, row.truth)}</p>
                  <p className="meta">{t('adminGamesOf', { count: row.games })}</p>
                  <div className="admin-actions">
                    <Link className="btn" to={`/admin/quizzes/${encodeURIComponent(row.id)}`} aria-label={`${t('adminView')}: ${row.title}`}>
                      {t('adminView')}
                    </Link>
                    <QuizCheckButton quizId={row.id} title={row.title} />
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove(row.id, row.title, nickText(row.author.nickname))}>
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
