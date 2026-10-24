import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { cloudKey, LIMITS, type Answer } from '@quiz/shared';
import { t } from '../i18n';

/** «100 до 1» на телефоні: одразу answers полів; однакові відповіді підсвічуються; Enter веде до наступного поля, з останнього надсилає. */
export function SurveyInput({
  answers,
  onSubmit,
  submitLabel,
  autoFocus = true,
}: {
  answers: number;
  onSubmit: (a: Answer) => void;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [fields, setFields] = useState<string[]>(() => Array.from({ length: answers }, () => ''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const keys = fields.map((value) => cloudKey(value));
  const same = keys.map((key, index) => key !== '' && keys.some((other, i) => i !== index && other === key));
  const ready = fields.some((value) => value.trim() !== '');

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const values = fields.map((value) => value.trim()).filter((value) => value !== '');
    if (values.length > 0) onSubmit({ type: 'survey', values });
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (index < fields.length - 1) refs.current[index + 1]?.focus();
    else submit();
  };

  return (
    <form className="survey-input" onSubmit={submit}>
      <p className="meta survey-hint">{t('surveyHint', { n: answers })}</p>
      {fields.map((value, index) => (
        <label key={index} className={same[index] ? 'field is-same' : 'field'}>
          <input
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={value}
            onChange={(event) => setFields((now) => now.map((old, i) => (i === index ? event.target.value : old)))}
            onKeyDown={(event) => onEnter(event, index)}
            aria-label={t('surveyAnswerN', { n: index + 1 })}
            maxLength={LIMITS.surveyAnswer}
            enterKeyHint={index < fields.length - 1 ? 'next' : 'send'}
            autoComplete="off"
            autoFocus={autoFocus && index === 0}
          />
          {same[index] && <span className="meta cloud-same">{t('surveySame')}</span>}
        </label>
      ))}
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {submitLabel ?? t('submit')}
      </button>
    </form>
  );
}
