import { useId, useState, type FormEvent } from 'react';
import { GROUP_EMOJI, GROUP_LIMITS, type GroupInput } from '@quiz/shared';
import { errorText, t, type TextKey } from '../i18n';
import { EmojiPicker } from './EmojiPicker';

/**
 * Назва, значок і опис групи (12k): «Створити групу» на сторінці «Групи» й «Налаштування» групи.
 * onSubmit повертає помилку (код) чи null; submit — підпис кнопки.
 */
export function GroupForm({
  initial,
  submit,
  onSubmit,
  onCancel,
  done,
}: {
  initial?: GroupInput;
  submit: TextKey;
  onSubmit: (input: GroupInput) => Promise<string | null>;
  onCancel?: () => void;
  /** Текст після успіху (напр. «Збережено»). */
  done?: string;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? GROUP_EMOJI[0]);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const empty = name.trim() === '';

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (empty || busy) return;
    setBusy(true);
    setSaved(false);
    const failed = await onSubmit({ name: name.trim(), emoji, description: description.trim() });
    setBusy(false);
    setError(failed === null ? null : errorText(failed));
    setSaved(failed === null);
  };

  return (
    <form className="group-form" onSubmit={(event) => void send(event)}>
      <div className="group-field-head">
        <label htmlFor={`${id}-name`}>{t('groupNameLabel')}</label>
        <span className="meta group-counter" id={`${id}-name-count`}>
          {t('groupCounter', { used: name.length, max: GROUP_LIMITS.nameMax })}
        </span>
      </div>
      <input
        id={`${id}-name`}
        aria-describedby={`${id}-name-count`}
        value={name}
        maxLength={GROUP_LIMITS.nameMax}
        placeholder={t('groupNamePlaceholder')}
        onChange={(event) => {
          setName(event.target.value);
          setSaved(false);
        }}
      />
      <span className="group-field-head" aria-hidden="true">
        {t('groupEmojiLabel')}
      </span>
      <EmojiPicker
        value={emoji}
        onChange={(next) => {
          setEmoji(next);
          setSaved(false);
        }}
      />
      <div className="group-field-head">
        <label htmlFor={`${id}-description`}>{t('groupDescriptionLabel')}</label>
        <span className="meta group-counter" id={`${id}-description-count`}>
          {t('groupCounter', { used: description.length, max: GROUP_LIMITS.descriptionMax })}
        </span>
      </div>
      <textarea
        id={`${id}-description`}
        aria-describedby={`${id}-description-count`}
        rows={2}
        value={description}
        maxLength={GROUP_LIMITS.descriptionMax}
        placeholder={t('groupDescriptionPlaceholder')}
        onChange={(event) => {
          setDescription(event.target.value);
          setSaved(false);
        }}
      />
      <div className="group-form-actions">
        <button type="submit" className="btn btn-primary" disabled={empty || busy}>
          {t(submit)}
        </button>
        {onCancel !== undefined && (
          <button type="button" className="btn" onClick={onCancel}>
            {t('cancel')}
          </button>
        )}
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && done !== undefined && (
        <p className="meta" role="status">
          {done}
        </p>
      )}
    </form>
  );
}
