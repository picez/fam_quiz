import { useState, type FormEvent } from 'react';
import { findProfile, follow } from '../api';
import { errorText, t } from '../i18n';

/** Поле «Нікнейм друга»: точний збіг, потім підписка. */
export function AddFriend({ onAdded }: { onAdded: () => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || nickname.trim() === '') return;
    setBusy(true);
    setError(null);
    const found = await findProfile(nickname);
    if (!found.ok) {
      setBusy(false);
      return setError(found.error === 'not_found' ? t('friendNotFound') : errorText(found.error));
    }
    const result = await follow(found.data.id);
    setBusy(false);
    if (result.ok) {
      setNickname('');
      onAdded();
    } else setError(result.error === 'self_follow' ? t('err_self_follow') : errorText(result.error));
  };

  return (
    <form className="add-friend" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>{t('friendNickname')}</span>
        <input value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} />
      </label>
      <button type="submit" className="btn btn-small" disabled={busy}>
        {t('addFriendButton')}
      </button>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
