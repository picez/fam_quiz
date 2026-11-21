import { useState, type JSX } from 'react';
import { ACHIEVEMENTS, type AchievementId } from '@quiz/shared';
import { formatDate } from '../../format';
import { t, type TextKey } from '../../i18n';
import { nickText } from '../../nick';
import { grantAchievement, revokeAchievements } from '../admin-api';
import type { CardProps } from '../AdminUser';
import { CardFold } from './CardFold';
import { PickList } from './PickList';

const nameOf = (id: AchievementId): string => t(`achievement_${id}` as TextKey);

/** Досягнення (58, 69): отримані — з вибором і одним «Відібрати вибрані», забрані адміном — позначкою; видати можна лише відсутнє. */
export function CardAchievements({ detail, act, busy }: CardProps): JSX.Element {
  const { user, card } = detail;
  const [pick, setPick] = useState<AchievementId | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const owned = new Set(card.achievements.map((item) => item.id));
  const missing = ACHIEVEMENTS.filter((id) => !owned.has(id));
  const nickname = nickText(user.nickname);

  const grant = async (id: AchievementId) => {
    if (await act(t('adminCardGrantConfirm', { name: nameOf(id), nickname }), () => grantAchievement(user.id, id), setError)) setPick('');
  };

  const revokePicked = (ids: AchievementId[], names: string[]) => {
    setNotice('');
    return act(
      t('adminCardRevokePickedConfirm', { nickname, count: ids.length, names: names.join(', ') }),
      async () => {
        const result = await revokeAchievements(user.id, ids);
        if (result.ok && result.notOwned.length > 0) setNotice(t('adminCardRevokePartial', { done: result.revoked.length, count: ids.length }));
        return result;
      },
      setError,
    );
  };

  return (
    <CardFold title={t('adminCardAchievements')} count={card.achievements.length} hint={card.blocked.length > 0 ? t('adminCardBlockedCount', { count: card.blocked.length }) : null}>
      {card.achievements.length === 0 ? (
        <p className="meta">{t('adminCardNoAchievements')}</p>
      ) : (
        <PickList
          title={t('adminCardAchievements')}
          items={card.achievements.map((item) => ({ id: item.id, name: nameOf(item.id), meta: item.earnedAt !== null ? formatDate(item.earnedAt) : undefined }))}
          action={t('adminCardRevokePicked')}
          danger
          busy={busy}
          onRun={(picked) => revokePicked(picked.map((item) => item.id as AchievementId), picked.map((item) => item.name))}
        />
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
      <p className="meta admin-card-line" role="status">
        {notice}
      </p>
    </CardFold>
  );
}
