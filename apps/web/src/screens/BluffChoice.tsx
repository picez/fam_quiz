import { useState } from 'react';
import type { BluffOptionView } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

/** Блеф, фаза вибору: варіанти кнопками на всю ширину; власна вигадка вимкнена з підписом. */
export function BluffChoice({ options, own, send }: { options: BluffOptionView[]; own: string[]; send: Send }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pick = (optionId: string) => {
    if (pending) return;
    setPending(true);
    void send('player:bluff', { optionId })
      .then((result) => setError(result.ok ? null : errorText(result.error)))
      .catch(() => setError(errorText('network')))
      .finally(() => setPending(false));
  };

  return (
    <section className="bluff-choice">
      <p className="lead bluff-hint">{t('bluffChoiceHint')}</p>
      {options.map((option) => {
        const mine = own.includes(option.id);
        return (
          <button key={option.id} type="button" className="btn" disabled={mine || pending} onClick={() => pick(option.id)}>
            <span>{option.text}</span>
            {mine && <span className="bluff-own">{t('bluffOwn')}</span>}
          </button>
        );
      })}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
