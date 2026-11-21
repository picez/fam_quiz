import { useState, type JSX } from 'react';
import { ADMIN_XP_MAX, ADMIN_XP_REASON_MAX } from '@quiz/shared';
import { formatDate, num, signedXp } from '../../format';
import { t } from '../../i18n';
import { nickText } from '../../nick';
import { adjustXp } from '../admin-api';
import type { CardProps } from '../AdminUser';
import { CardFold } from './CardFold';

/** Ціле від −ADMIN_XP_MAX до ADMIN_XP_MAX, не 0; інакше null (кнопка неактивна). */
function amountOf(draft: string): number | null {
  if (!/^\s*[-+−]?\d+\s*$/.test(draft)) return null;
  const value = Number(draft.trim().replace('−', '-'));
  return Number.isSafeInteger(value) && value !== 0 && Math.abs(value) <= ADMIN_XP_MAX ? value : null;
}

/** Ручний досвід (58): зміна з обов'язковою причиною; попередні ручні зміни — списком. */
export function CardXp({ detail, act, busy }: CardProps): JSX.Element {
  const { user, card } = detail;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const value = amountOf(amount);
  const why = reason.replace(/\s+/g, ' ').trim();
  const ready = value !== null && why.length > 0;

  const submit = async (change: number) => {
    setNotice('');
    const done = await act(
      t('adminCardXpConfirm', { nickname: nickText(user.nickname), amount: signedXp(change) }),
      async () => {
        const result = await adjustXp(user.id, change, why);
        if (result.ok) setNotice(t('adminCardXpDone', { level: result.level, xp: num(result.xp) }));
        return result;
      },
      setError,
    );
    if (done) {
      setAmount('');
      setReason('');
    }
  };

  return (
    <CardFold title={t('adminCardXp')} count={card.xp.length}>
      {card.xp.length > 0 && (
        <ul className="admin-card-lines">
          {card.xp.map((line) => (
            <li key={line.id}>
              <strong dir="ltr">{signedXp(line.amount)}</strong> <span dir="auto">{line.balance ? t('levelAdminBalance') : line.note}</span> <span className="meta">{formatDate(line.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-card-form">
        <label className="field">
          <span>{t('adminCardXpAmount')}</span>
          <input type="text" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} maxLength={6} />
        </label>
        <label className="field">
          <span>{t('adminCardXpReason')}</span>
          <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={ADMIN_XP_REASON_MAX} />
        </label>
        <button type="button" className="btn" disabled={busy || !ready} onClick={() => value !== null && void submit(value)}>
          {t('adminCardXpAdd')}
        </button>
      </div>
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
      <p className="meta admin-card-line" role="status">
        {notice}
      </p>
    </CardFold>
  );
}
