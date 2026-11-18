import { useState, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { REPORT_REASONS, type AdminReportItem } from '@quiz/shared';
import { formatDate } from '../format';
import { countText, errorText, t } from '../i18n';
import { nickText } from '../nick';
import { AdminPager } from './Admin';
import { actOnProfileReport, actOnQuizReport, adminReports } from './admin-api';
import { useAdminData } from './useAdminData';

type Reasons = AdminReportItem['reasons'];

function ReasonList({ reasons }: { reasons: Reasons }): JSX.Element | null {
  const rows = REPORT_REASONS.filter((reason) => (reasons[reason] ?? 0) > 0);
  if (rows.length === 0) return null;
  return (
    <ul className="admin-reasons">
      {rows.map((reason) => (
        <li key={reason}>{`${t(`reportReason_${reason}`)} × ${reasons[reason]}`}</li>
      ))}
    </ul>
  );
}

export function AdminReports(): JSX.Element {
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useAdminData(() => adminReports(page), String(page));

  const act = async (confirm: string, run: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    if (!window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    const result = await run();
    setBusy(false);
    if (result.ok) state.reload();
    else setError(errorText(result.error));
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <p className="meta">{t('adminReportsIntro')}</p>
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
            <p className="meta">{t('adminReportsEmpty')}</p>
          ) : (
            <ul className="admin-list admin-reports">
              {state.data.rows.map((item) =>
                item.kind === 'quiz' ? (
                  <li key={`q:${item.entryId}`} className="admin-card panel">
                    <h2 dir="auto">{t('adminReportQuiz', { title: item.title, name: nickText(item.author.nickname) })}</h2>
                    <Meta item={item} />
                    {item.moderation === 'auto_hidden' && <p className="admin-mark">{t('libraryStatusAuto')}</p>}
                    {item.moderation === 'hidden' && <p className="admin-mark">{t('libraryStatusHidden')}</p>}
                    {item.appeal && <p className="admin-mark">{t('adminReportAppeal')}</p>}
                    <div className="admin-actions">
                      <Link className="btn" to={`/admin/quizzes/${encodeURIComponent(item.quizId)}`}>
                        {t('adminReportOpenQuiz')}
                      </Link>
                      {item.moderation !== 'hidden' && (
                        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminHideQuizConfirm', { title: item.title }), () => actOnQuizReport(item.entryId, 'hide'))}>
                          {t('adminHideQuiz')}
                        </button>
                      )}
                      {item.moderation === 'hidden' && item.appeal && (
                        <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminRestoreQuizConfirm', { title: item.title }), () => actOnQuizReport(item.entryId, 'restore'))}>
                          {t('adminRestoreQuiz')}
                        </button>
                      )}
                      <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminDismissConfirm'), () => actOnQuizReport(item.entryId, 'dismiss'))}>
                        {t('adminDismissReport')}
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={`p:${item.userId}`} className="admin-card panel">
                    <h2 dir="auto">{t('adminReportProfile', { name: nickText(item.nickname) })}</h2>
                    <Meta item={item} />
                    <div className="admin-actions">
                      <Link className="btn" to={`/admin/users/${encodeURIComponent(item.userId)}`}>
                        {t('adminReportOpenUser')}
                      </Link>
                      {item.nickname !== null && (
                        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminResetNickConfirm', { name: item.nickname ?? '' }), () => actOnProfileReport(item.userId, 'reset_nickname'))}>
                          {t('adminResetNick')}
                        </button>
                      )}
                      {item.avatar !== null && (
                        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminResetAvatarConfirm', { name: nickText(item.nickname) }), () => actOnProfileReport(item.userId, 'reset_avatar'))}>
                          {t('adminResetAvatar')}
                        </button>
                      )}
                      <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminDismissConfirm'), () => actOnProfileReport(item.userId, 'dismiss'))}>
                        {t('adminDismissReport')}
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}

function Meta({ item }: { item: AdminReportItem }): JSX.Element {
  return (
    <>
      {item.reports > 0 && <p className="meta">{countText('adminReportCount', item.reports, { count: item.reports })}</p>}
      <ReasonList reasons={item.reasons} />
      {item.texts.map((text, index) => (
        <blockquote key={index} className="admin-note" dir="auto">
          {text}
        </blockquote>
      ))}
      <p className="meta">{formatDate(item.since)}</p>
    </>
  );
}
