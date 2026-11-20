import { useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { t } from '../../i18n';
import { deleteUserAsAdmin } from '../admin-api';
import type { CardProps } from '../AdminUser';

/**
 * Видалення акаунта (58): кнопка активна лише, коли набрано точно нік (без ніку — email), як порівнює сервер;
 * далі ще підтвердження; після успіху — до списку гравців (картку не перечитують: її вже немає).
 */
export function CardDelete({ detail, act, busy }: CardProps): JSX.Element {
  const { user } = detail;
  const label = user.nickname ?? user.email;
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const matches = typed.trim() === label;

  const remove = async () => {
    if (await act(t('adminCardDeleteConfirm', { nickname: label }), () => deleteUserAsAdmin(user.id, typed.trim()), setError, false)) setDeleted(true);
  };

  if (deleted) return <Navigate to="/admin/users" replace />;
  return (
    <section className="panel admin-card-section admin-card-delete">
      <h2>{t('adminCardDelete')}</h2>
      <p>{t('adminCardDeleteLead')}</p>
      <label className="field">
        <span>{t('adminCardDeleteType', { nickname: label })}</span>
        <input type="text" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} maxLength={200} />
      </label>
      <button type="button" className="btn btn-danger" disabled={busy || !matches} onClick={() => void remove()}>
        {t('adminCardDelete')}
      </button>
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
    </section>
  );
}
