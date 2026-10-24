import { useState, type FormEvent } from 'react';
import { cloudKey, cloudWords, LIMITS, type Answer } from '@quiz/shared';
import { t } from '../i18n';

/** «Хмара слів» на телефоні: до words коротких слів; однакові слова підсвічуються. */
export function CloudInput({ words, onSubmit, autoFocus = true }: { words: number; onSubmit: (a: Answer) => void; autoFocus?: boolean }) {
  const [fields, setFields] = useState<string[]>(['']);
  const keys = fields.map((value) => cloudKey(value));
  const same = keys.map((key, index) => key !== '' && keys.some((other, i) => i !== index && other === key));
  const ready = fields.some((value) => value.trim() !== '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const list = cloudWords(fields, words);
    if (list.length > 0) onSubmit({ type: 'wordcloud', words: list });
  };

  return (
    <form className="cloud-input" onSubmit={submit}>
      {fields.map((value, index) => (
        <label key={index} className={same[index] ? 'field is-same' : 'field'}>
          <input
            value={value}
            onChange={(event) => setFields((now) => now.map((old, i) => (i === index ? event.target.value : old)))}
            aria-label={t('cloudWordN', { n: index + 1 })}
            maxLength={LIMITS.cloudWord}
            autoComplete="off"
            autoFocus={autoFocus && index === 0}
          />
          {same[index] && <span className="meta cloud-same">{t('cloudSame')}</span>}
        </label>
      ))}
      {fields.length < words && (
        <button type="button" className="btn" onClick={() => setFields((now) => [...now, ''])}>
          {t('cloudMore')}
        </button>
      )}
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {t('submit')}
      </button>
    </form>
  );
}
