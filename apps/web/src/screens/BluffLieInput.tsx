import { useRef, useState, type FormEvent } from 'react';
import { LIMITS } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';
import type { DraftInput } from './TeamWatch';

/** Блеф, фаза вигадок: одне поле й кнопка; відмову сервера («Це правда!») видно під полем, текст лишається. */
export function BluffLieInput({
  send,
  autoFocus = true,
  onDraft,
}: {
  send: Send;
  autoFocus?: boolean;
  /** Живий вибір (12b): надрукована вигадка до «Надіслати»; порожньо — null. */
  onDraft?: DraftInput;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Останній надрукований текст: поки чекали відповіді, гравець міг його змінити.
  const typed = useRef('');
  typed.current = text.trim();
  const draftRef = useRef(onDraft);
  draftRef.current = onDraft;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const lie = text.trim();
    if (lie === '' || pending) return;
    setPending(true);
    onDraft?.cancel?.();
    void send('player:lie', { text: lie })
      .then((result) => {
        setError(result.ok ? null : errorText(result.error));
        // Відмова («Це правда!»): текст лишається в полі — пульт знову бачить його як чернетку.
        if (!result.ok && typed.current !== '') draftRef.current?.({ type: 'lie', text: typed.current });
      })
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
          const typed = event.target.value.trim();
          onDraft?.(typed === '' ? null : { type: 'lie', text: typed });
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
