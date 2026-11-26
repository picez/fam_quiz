import { useState, type JSX } from 'react';
import { t } from '../../i18n';
import { nickText } from '../../nick';
import { refreshAdminBadge } from '../Admin';
import { actOnProfileReport, banUser, unbanUser } from '../admin-api';
import type { CardProps } from '../AdminUser';
import { CardFold } from './CardFold';

/** Модерація: бан / розбан і «Скинути нік» / «Скинути аватар» (58, та сама дія, що й зі скарги); адміну — лише розбан. */
export function CardModeration({ detail, act, busy }: CardProps): JSX.Element | null {
  const { user, card } = detail;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Скидання ніку чи аватара закриває відкриті скарги на профіль: бейдж «Звернень» перечитується (70), як після дії зі скарги.
  const resetProfile = (action: 'reset_nickname' | 'reset_avatar') => async () => {
    const result = await actOnProfileReport(user.id, action);
    if (result.ok) refreshAdminBadge();
    return result;
  };
  const nickname = nickText(user.nickname);
  if (user.admin && user.banned === null) return null;
  return (
    <CardFold title={t('adminCardModeration')} hint={user.banned !== null ? t('adminBannedShort') : null}>
      {user.banned !== null ? (
        <>
          {user.banned.reason !== null && <p>{t('adminReasonShown', { reason: user.banned.reason })}</p>}
          <button type="button" className="btn" disabled={busy} onClick={() => void act(t('adminUnbanConfirm', { nickname }), () => unbanUser(user.id), setError)}>
            {t('adminUnban')}
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>{t('adminBanReason')}</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2} />
          </label>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminBanConfirm', { nickname }), () => banUser(user.id, reason.trim()), setError)}>
            {t('adminBan')}
          </button>
        </>
      )}
      {!user.admin && (user.nickname !== null || card.overview.avatar !== null) && (
        <div className="admin-actions">
          {user.nickname !== null && (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminCardResetNickConfirm', { nickname }), resetProfile('reset_nickname'), setError)}>
              {t('adminCardResetNick')}
            </button>
          )}
          {card.overview.avatar !== null && (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminCardResetAvatarConfirm', { nickname }), resetProfile('reset_avatar'), setError)}>
              {t('adminCardResetAvatar')}
            </button>
          )}
        </div>
      )}
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
    </CardFold>
  );
}
