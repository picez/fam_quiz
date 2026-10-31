import { LIMITS } from '@quiz/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { findProfile, follow, searchProfiles } from '../api';
import { errorText, t } from '../i18n';

/** Поле «Нікнейм друга»: підказки за початком нікнейму (беклог 9), точний збіг, потім підписка. */
export function AddFriend({ onAdded }: { onAdded: () => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  // Підказки — за паузою в наборі, від двох символів; застаріла відповідь не перезаписує свіжішу.
  useEffect(() => {
    const query = nickname.trim();
    if (query.length < 2) {
      setHints([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void searchProfiles(query).then((result) => {
        if (current && result.ok) setHints(result.data.map((card) => card.nickname));
      });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [nickname]);

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
        <input value={nickname} maxLength={LIMITS.nicknameMax} list="friend-hints" autoComplete="off" onChange={(event) => setNickname(event.target.value)} />
        <datalist id="friend-hints">
          {hints.map((hint) => (
            <option key={hint} value={hint} />
          ))}
        </datalist>
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
