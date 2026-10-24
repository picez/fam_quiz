import { useState, type FormEvent } from 'react';
import { LIMITS } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

/** Блеф, фаза вигадок: одне поле й кнопка; відмову сервера («Це правда!») видно під полем, текст лишається. */
export function BluffLieInput({ send, autoFocus = true }: { send: Send; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const lie = text.trim();
    if (lie === '' || pending) return;
    setPending(true);
    void send('player:lie', { text: lie })
      .then((result) => setError(result.ok ? null : errorText(result.error)))
      .catch(() => setError(errorText('network')))
      .finally(() => setPending(false));
  };

  return (
    <form className="bluff-input" onSubmit={submit}>
      <p className="meta bluff-hint">{t('bluffLieHint')}</p>
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        aria-label={t('bluffLieField')}
        maxLength={LIMITS.bluffLie}
        enterKeyHint="send"
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <button type="submit" className="btn btn-primary" disabled={text.trim() === '' || pending}>
        {t('bluffLieSend')}
      </button>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
