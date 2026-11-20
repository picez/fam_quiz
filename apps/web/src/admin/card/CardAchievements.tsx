import { useState, type JSX } from 'react';
import { ACHIEVEMENTS, type AchievementId } from '@quiz/shared';
import { formatDate } from '../../format';
import { t, type TextKey } from '../../i18n';
import { nickText } from '../../nick';
import { grantAchievement, revokeAchievement } from '../admin-api';
import type { CardProps } from '../AdminUser';

const nameOf = (id: AchievementId): string => t(`achievement_${id}` as TextKey);

/** Досягнення (58): отримані з кнопкою «Відібрати», забрані адміном — позначкою; видати можна лише відсутнє. */
export function CardAchievements({ detail, act, busy }: CardProps): JSX.Element {
  const { user, card } = detail;
  const [pick, setPick] = useState<AchievementId | ''>('');
  const [error, setError] = useState<string | null>(null);
  const owned = new Set(card.achievements.map((item) => item.id));
  const missing = ACHIEVEMENTS.filter((id) => !owned.has(id));
  const nickname = nickText(user.nickname);

  const grant = async (id: AchievementId) => {
    if (await act(t('adminCardGrantConfirm', { name: nameOf(id), nickname }), () => grantAchievement(user.id, id), setError)) setPick('');
  };

  return (
    <section className="panel admin-card-section">
      <h2>{t('adminCardAchievements')}</h2>
      {card.achievements.length === 0 ? (
        <p className="meta">{t('adminCardNoAchievements')}</p>
      ) : (
        <ul className="admin-list">
          {card.achievements.map((item) => (
            <li key={item.id} className="admin-card">
              <p>{nameOf(item.id)}</p>
              {item.earnedAt !== null && <p className="meta">{formatDate(item.earnedAt)}</p>}
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act(t('adminCardRevokeConfirm', { name: nameOf(item.id), nickname }), () => revokeAchievement(user.id, item.id), setError)}>
                {t('adminCardRevoke')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {card.blocked.length > 0 && (
        <ul className="admin-card-blocked">
          {card.blocked.map((id) => (
            <li key={id} className="meta">
              {`${nameOf(id)} — ${t('adminCardBlocked')}`}
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <div className="admin-card-form">
          <label className="field">
            <span>{t('adminCardGrantPick')}</span>
            <select value={pick} onChange={(event) => setPick(event.target.value as AchievementId | '')}>
              <option value="">—</option>
              {missing.map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" disabled={busy || pick === ''} onClick={() => pick !== '' && void grant(pick)}>
            {t('adminCardGrant')}
          </button>
        </div>
      )}
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
    </section>
  );
}
