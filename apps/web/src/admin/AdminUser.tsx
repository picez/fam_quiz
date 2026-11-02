import { useState, type JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { AdminAward, AdminPrize, AdminUserDetail } from '@quiz/shared';
import type { ApiResult } from '../api';
import { errorText, t } from '../i18n';
import { adminUser, banUser, deleteAwardAsAdmin, deletePrizeAsAdmin, unbanUser } from './admin-api';
import { UserCard } from './AdminUsers';
import { useAdminData } from './useAdminData';

export function AdminUser(): JSX.Element {
  const { id = '' } = useParams();
  const state = useAdminData(() => adminUser(id), id);
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
  return <UserView detail={state.data} reload={state.reload} />;
}

function UserView({ detail, reload }: { detail: AdminUserDetail; reload: () => void }): JSX.Element {
  const { user, stock, awards } = detail;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  /** Дія з підтвердженням; після успіху картка перечитується, not_found веде на головну. */
  const act = async (confirmText: string, run: () => Promise<ApiResult<object>>) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const result = await run();
    setBusy(false);
    if (result.ok) reload();
    else if (result.error === 'not_found') setGone(true);
    else setError(errorText(result.error));
  };

  if (gone) return <Navigate to="/" replace />;
  return (
    <>
      <Link className="quiet-link" to="/admin/users">
        {t('adminBack')}
      </Link>
      <ul className="admin-list">
        <UserCard row={user} link={false} />
      </ul>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {user.banned !== null ? (
        <section className="panel">
          {user.banned.reason !== null && <p>{t('adminReasonShown', { reason: user.banned.reason })}</p>}
          <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminUnbanConfirm', { nickname: user.nickname }), () => unbanUser(user.id))}>
            {t('adminUnban')}
          </button>
        </section>
      ) : (
        !user.admin && (
          <section className="panel">
            <label className="field">
              <span>{t('adminBanReason')}</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2} />
            </label>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void act(t('adminBanConfirm', { nickname: user.nickname }), () => banUser(user.id, reason.trim()))}
            >
              {t('adminBan')}
            </button>
          </section>
        )
      )}
      <h2>{t('adminPrizes')}</h2>
      <h3>{t('adminStock')}</h3>
      {stock.length === 0 ? (
        <p className="meta">{t('adminNoPrizes')}</p>
      ) : (
        <ul className="admin-list">
          {stock.map((prize: AdminPrize) => (
            <li key={prize.id} className="admin-card">
              <p>{prize.content.name}</p>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void act(t('adminDeletePrizeConfirm', { name: prize.content.name }), () => deletePrizeAsAdmin(prize.id))}
              >
                {t('adminDeletePrize')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{t('adminShowcase')}</h3>
      {awards.length === 0 ? (
        <p className="meta">{t('adminNoPrizes')}</p>
      ) : (
        <ul className="admin-list">
          {awards.map((award: AdminAward) => (
            <li key={award.id} className="admin-card">
              <p>«{award.quizTitle}»</p>
              <p className="meta">{t('adminPlace', { place: award.place })}</p>
              {award.content.engraving !== null && <p>{award.content.engraving}</p>}
              {award.content.title !== null && <p>{award.content.title}</p>}
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void act(t('adminDeleteAwardConfirm', { quiz: award.quizTitle }), () => deleteAwardAsAdmin(award.id))}
              >
                {t('adminDeleteAward')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
