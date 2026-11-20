import { useState, type FormEvent, type JSX } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { PROBLEM_REPLY_MAX, type AdminProblemReport, type AdminServerError } from '@quiz/shared';
import { formatDate } from '../format';
import { errorText, t } from '../i18n';
import { LOCALE_NAMES } from '../locales/locales';
import { nickText } from '../nick';
import { AdminPager } from './Admin';
import { adminErrors, adminProblems, replyProblem, resolveProblem, resolveServerError } from './admin-api';
import { useAdminData, type AdminData } from './useAdminData';

type Live = { error: string | null; notice: string | null };

/** Живі області стоять з першого показу (порожні), щоб читач екрана почув і першу помилку. */
function LiveRegions({ live }: { live: Live }): JSX.Element {
  return (
    <>
      <p className="error admin-errors-live" role="alert">
        {live.error ?? ''}
      </p>
      <p className="meta admin-errors-live" role="status">
        {live.notice ?? ''}
      </p>
    </>
  );
}

/** «Нові / Вирішені» («Відкриті / Вирішені»): перемикач-кнопки з aria-pressed. */
function StatusFilter<S extends string>({ value, options, onChange }: { value: S; options: { value: S; label: string }[]; onChange: (value: S) => void }): JSX.Element {
  return (
    <div className="admin-errors-filter">
      {options.map((option) => (
        <button key={option.value} type="button" className="btn" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Завантаження / помилка з «Спробувати ще»; null — дані готові. */
function Loading<T>({ state }: { state: AdminData<T> & { reload: () => void } }): JSX.Element | null {
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <p className="error">{state.message}</p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }
  return null;
}

/** Текст збою чи стек — лише як текст, у прокручуваному pre з переносом рядків (без бічного скролу). */
function ErrorText({ text }: { text: string }): JSX.Element {
  return (
    <pre className="admin-error-pre" dir="ltr" tabIndex={0}>
      {text}
    </pre>
  );
}

function ServerErrorCard({ row, busy, onResolve }: { row: AdminServerError; busy: boolean; onResolve: () => void }): JSX.Element {
  const context = [row.what, row.event].filter((part): part is string => part !== null && part !== '').join(' · ');
  return (
    <li className="admin-card panel">
      <p className="admin-mark" dir="ltr">
        {t('adminErrorWhere', { where: row.where })}
      </p>
      {context !== '' && (
        <p className="meta" dir="ltr">
          <code>{context}</code>
        </p>
      )}
      <ErrorText text={`${row.name}: ${row.message}`} />
      <p className="meta">{t('adminErrorCounts', { count: row.count, day: row.dayCount })}</p>
      <p className="meta">{t('adminErrorTimes', { first: formatDate(row.firstAt), last: formatDate(row.lastAt) })}</p>
      {row.stack !== null && row.stack !== '' && (
        <details className="admin-error-stack">
          <summary>{t('adminErrorStack')}</summary>
          <ErrorText text={row.stack} />
        </details>
      )}
      {row.status === 'resolved' && row.resolvedAt !== null && <p className="meta">{t('adminErrorResolvedBy', { admin: nickText(row.resolvedBy), time: formatDate(row.resolvedAt) })}</p>}
      {row.status === 'new' && (
        <div className="admin-actions">
          <button type="button" className="btn" disabled={busy} onClick={onResolve}>
            {t('adminErrorResolve')}
          </button>
        </div>
      )}
    </li>
  );
}

function ServerErrors(): JSX.Element {
  const [status, setStatus] = useState<AdminServerError['status']>('new');
  const [page, setPage] = useState(1);
  const [live, setLive] = useState<Live>({ error: null, notice: null });
  const [busy, setBusy] = useState(false);
  // Вирішені щойно — ховаємо одразу, не чекаючи перечитування.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const location = useLocation();
  const state = useAdminData(() => adminErrors(status, page), `${status}:${page}:${location.key}`, { keep: true });

  const pick = (next: AdminServerError['status']) => {
    setStatus(next);
    setPage(1);
    setLive({ error: null, notice: null });
  };
  const resolve = async (row: AdminServerError) => {
    setBusy(true);
    setLive({ error: null, notice: null });
    const result = await resolveServerError(row.id);
    setBusy(false);
    if (!result.ok) {
      setLive({ error: errorText(result.error), notice: null });
      return;
    }
    setGone((prev) => new Set(prev).add(row.id));
    state.reload();
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  const rows = state.status === 'ready' ? state.data.rows.filter((row) => !(status === 'new' && gone.has(row.id))) : [];
  return (
    <>
      <StatusFilter
        value={status}
        options={[
          { value: 'new', label: t('adminErrorsNew') },
          { value: 'resolved', label: t('adminErrorsResolvedFilter') },
        ]}
        onChange={pick}
      />
      <LiveRegions live={live} />
      <Loading state={state} />
      {state.status === 'ready' && (
        <>
          {rows.length === 0 ? (
            <p className="meta">{t('adminErrorsEmpty')}</p>
          ) : (
            <ul className="admin-list">
              {rows.map((row) => (
                <ServerErrorCard key={row.id} row={row} busy={busy} onResolve={() => void resolve(row)} />
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}

function Author({ who }: { who: AdminProblemReport['who'] }): JSX.Element {
  if (who.kind === 'account') {
    return (
      <Link to={`/admin/users/${encodeURIComponent(who.id)}`} dir="auto">
        {nickText(who.nickname)}
      </Link>
    );
  }
  return <span>{t(who.kind === 'guest' ? 'adminProblemGuest' : 'adminProblemDeleted')}</span>;
}

function PageInfo({ page }: { page: AdminProblemReport['page'] }): JSX.Element {
  if (page === null) return <p className="meta">{t('adminProblemNoPage')}</p>;
  return (
    <ul className="admin-problem-page meta">
      <li dir="auto">{t('problemPagePath', { path: page.path })}</li>
      <li dir="auto">{t('problemPageBrowser', { browser: page.browser })}</li>
      <li dir="auto">{t('problemPageScreen', { screen: page.screen })}</li>
      <li dir="auto">{t('problemPageLang', { lang: LOCALE_NAMES[page.lang] })}</li>
      <li dir="auto">{t('problemPageTheme', { theme: t(page.theme === 'light' ? 'problemThemeLight' : 'problemThemeDark') })}</li>
    </ul>
  );
}

type ReportCardProps = { row: AdminProblemReport; busy: boolean; onResolve: () => void; onReply: (text: string) => void };

function ReportCard({ row, busy, onResolve, onReply }: ReportCardProps): JSX.Element {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const canReply = row.who.kind === 'account' && row.reply === null;
  const fieldId = `problem-reply-${row.id}`;
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '' || busy) return;
    onReply(text.trim());
  };
  return (
    <li className="admin-card panel">
      <p className="admin-mark">
        <Author who={row.who} />
      </p>
      <p className="meta">{formatDate(row.at)}</p>
      <blockquote className="admin-note admin-problem-text" dir="auto">
        {row.text}
      </blockquote>
      <PageInfo page={row.page} />
      {row.reply !== null && (
        <p className="admin-problem-text" dir="auto">
          {t('adminProblemReplied', { text: row.reply })}
        </p>
      )}
      {row.status === 'resolved' && row.resolvedAt !== null && <p className="meta">{t('adminErrorResolvedBy', { admin: nickText(row.resolvedBy), time: formatDate(row.resolvedAt) })}</p>}
      {(row.status === 'open' || canReply) && (
        <div className="admin-actions">
          {row.status === 'open' && (
            <button type="button" className="btn" disabled={busy} onClick={onResolve}>
              {t('adminProblemResolve')}
            </button>
          )}
          {canReply && !replying && (
            <button type="button" className="btn" onClick={() => setReplying(true)}>
              {t('adminProblemReply')}
            </button>
          )}
        </div>
      )}
      {canReply && replying && row.who.kind === 'account' && (
        <form className="admin-problem-reply" onSubmit={send}>
          <label className="field" htmlFor={fieldId}>
            {t('adminProblemReplyLabel')}
          </label>
          <textarea id={fieldId} value={text} maxLength={PROBLEM_REPLY_MAX} rows={3} dir="auto" aria-describedby={`${fieldId}-count`} onChange={(e) => setText(e.target.value)} />
          <p className="meta admin-problem-count" id={`${fieldId}-count`}>
            {t('problemChars', { used: text.length, max: PROBLEM_REPLY_MAX })}
          </p>
          {!row.who.push && <p className="meta">{t('adminProblemReplyNoPush')}</p>}
          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ''}>
              {t('adminProblemReplySend')}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function PlayerReports(): JSX.Element {
  const [status, setStatus] = useState<AdminProblemReport['status']>('open');
  const [page, setPage] = useState(1);
  const [live, setLive] = useState<Live>({ error: null, notice: null });
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const state = useAdminData(() => adminProblems(status, page), `${status}:${page}:${location.key}`, { keep: true });

  const pick = (next: AdminProblemReport['status']) => {
    setStatus(next);
    setPage(1);
    setLive({ error: null, notice: null });
  };
  const act = async (run: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    setLive({ error: null, notice: null });
    const result = await run();
    setBusy(false);
    if (result.ok) state.reload();
    else setLive({ error: errorText(result.error), notice: null });
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <StatusFilter
        value={status}
        options={[
          { value: 'open', label: t('adminProblemsOpen') },
          { value: 'resolved', label: t('adminErrorsResolvedFilter') },
        ]}
        onChange={pick}
      />
      <LiveRegions live={live} />
      <Loading state={state} />
      {state.status === 'ready' && (
        <>
          {state.data.rows.length === 0 ? (
            <p className="meta">{t('adminProblemsEmpty')}</p>
          ) : (
            <ul className="admin-list">
              {state.data.rows.map((row) => (
                <ReportCard key={row.id} row={row} busy={busy} onResolve={() => void act(() => resolveProblem(row.id))} onReply={(text) => void act(() => replyProblem(row.id, text))} />
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}

/** Вкладка «Збої» (64): збої сервера (згруповані, з повторами й стеком) і скарги гравців (`?view=reports`). */
export function AdminErrors(): JSX.Element {
  const [params] = useSearchParams();
  const reports = params.get('view') === 'reports';
  return (
    <div className="admin-errors">
      <nav className="admin-errors-views" aria-label={t('adminTabErrors')}>
        <Link className="btn" to="/admin/errors" aria-current={reports ? undefined : 'page'}>
          {t('adminErrorsServer')}
        </Link>
        <Link className="btn" to="/admin/errors?view=reports" aria-current={reports ? 'page' : undefined}>
          {t('adminErrorsReports')}
        </Link>
      </nav>
      {reports ? <PlayerReports key="reports" /> : <ServerErrors key="server" />}
    </div>
  );
}
