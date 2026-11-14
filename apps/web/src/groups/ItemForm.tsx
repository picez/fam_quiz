import { useId, useState, type FormEvent } from 'react';
import { GROUP_ITEM_KINDS, GROUP_LIMITS, type GroupItem, type GroupItemInput, type GroupItemKind, type GroupMember } from '@quiz/shared';
import { ACCEPT, useImageUpload } from '../editor/ImageField';
import { errorText, t } from '../i18n';
import { AboutChips, type AboutPick } from './AboutChips';

const YEAR = /^\d{4}$/;

/** Рік порожній або ціле в межах GROUP_LIMITS (як перевіряє сервер). */
export function yearOk(year: string): boolean {
  const clean = year.trim();
  if (clean === '') return true;
  if (!YEAR.test(clean)) return false;
  const value = Number(clean);
  return value >= GROUP_LIMITS.yearMin && value <= GROUP_LIMITS.yearMax;
}

/** Тіло запиту з полів форми: порожня відповідь — null, рік — число. */
export function itemInput(fields: { kind: GroupItemKind; text: string; about: AboutPick[]; answer: string; year: string; photo: string | null; surprise: boolean }): GroupItemInput {
  const hasMember = fields.about.some((entry) => entry.kind === 'member');
  return {
    kind: fields.kind,
    text: fields.text.trim(),
    about: fields.about.map((entry) => (entry.kind === 'member' ? { kind: 'member', userId: entry.userId } : { kind: 'name', name: entry.name })),
    answer: fields.answer.trim() === '' ? null : fields.answer.trim(),
    year: fields.year.trim() === '' ? null : Number(fields.year.trim()),
    photo: fields.photo,
    surprise: fields.surprise && hasMember,
  };
}

/**
 * Форма запису групи на один екран (12k): вид — вкладки, текст, «про кого», відповідь і рік в одному рядку,
 * фото й «Сюрприз» в одному рядку, «Зберегти запис» і «Скасувати» — у липкій смузі над меню.
 * onSubmit повертає код помилки чи null.
 */
export function ItemForm({
  members,
  initial,
  onSubmit,
  onCancel,
}: {
  members: GroupMember[];
  initial?: GroupItem;
  onSubmit: (input: GroupItemInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<GroupItemKind>(initial?.kind ?? 'fact');
  const [text, setText] = useState(initial?.text ?? '');
  const [about, setAbout] = useState<AboutPick[]>(initial?.about ?? []);
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [year, setYear] = useState(initial?.year === null || initial?.year === undefined ? '' : String(initial.year));
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [surprise, setSurprise] = useState(initial?.surprise ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useImageUpload(setPhoto);
  const hasMember = about.some((entry) => entry.kind === 'member');
  const yearBad = !yearOk(year);
  const blocked = text.trim() === '' || upload.busy || busy || yearBad;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    setBusy(true);
    const failed = await onSubmit(itemInput({ kind, text, about, answer, year, photo, surprise }));
    setBusy(false);
    setError(failed === null ? null : errorText(failed));
  };

  return (
    <form className="item-form" onSubmit={(event) => void send(event)}>
      <div role="radiogroup" className="item-kind-tabs" aria-label={t('itemKindsLabel')}>
        {GROUP_ITEM_KINDS.map((each) => (
          <button key={each} type="button" role="radio" aria-checked={kind === each} className={kind === each ? 'chip is-on' : 'chip'} onClick={() => setKind(each)}>
            {t(`itemKind_${each}`)}
          </button>
        ))}
      </div>
      <div className="group-field-head">
        <label htmlFor={`${id}-text`}>{t('itemTextLabel')}</label>
        <span className="meta group-counter" id={`${id}-text-count`}>
          {t('groupCounter', { used: text.length, max: GROUP_LIMITS.textMax })}
        </span>
      </div>
      <textarea
        id={`${id}-text`}
        rows={4}
        value={text}
        maxLength={GROUP_LIMITS.textMax}
        placeholder={t(`itemTextPlaceholder_${kind}`)}
        aria-describedby={`${id}-text-count`}
        onChange={(event) => setText(event.target.value)}
      />
      <AboutChips members={members} value={about} onChange={setAbout} />
      <div className="item-form-row">
        <label className="item-answer">
          <span>{t('itemAnswerLabel')}</span>
          <input value={answer} maxLength={GROUP_LIMITS.answerMax} placeholder={t('itemAnswerPlaceholder')} aria-describedby={`${id}-answer-hint`} onChange={(event) => setAnswer(event.target.value)} />
        </label>
        <label className="item-year">
          <span>{t('itemYearLabel')}</span>
          <input
            value={year}
            inputMode="numeric"
            maxLength={4}
            placeholder="1998"
            aria-invalid={yearBad}
            aria-describedby={yearBad ? `${id}-year-hint` : undefined}
            onChange={(event) => setYear(event.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      <p className="meta item-hint" id={`${id}-answer-hint`}>
        {t('itemAnswerHint')}
      </p>
      {yearBad && (
        <p className="error item-hint" id={`${id}-year-hint`}>
          {t('itemYearHint', { min: GROUP_LIMITS.yearMin, max: GROUP_LIMITS.yearMax })}
        </p>
      )}
      <div className="item-form-row">
        {photo === null ? (
          <label className={upload.busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
            {t(upload.busy ? 'uploading' : 'itemPhotoAdd')}
            <input type="file" accept={ACCEPT} disabled={upload.busy} onChange={(event) => void upload.pick(event)} />
          </label>
        ) : (
          <span className="item-photo">
            <img src={photo} alt="" />
            <button type="button" className="btn btn-small" onClick={() => setPhoto(null)}>
              {t('itemPhotoRemove')}
            </button>
          </span>
        )}
        <label className="item-surprise" title={hasMember ? t('itemSurpriseHint') : t('err_invalid_payload_surprise_needs_member')}>
          <input type="checkbox" checked={surprise && hasMember} disabled={!hasMember} aria-describedby={`${id}-surprise-hint`} onChange={(event) => setSurprise(event.target.checked)} />
          <span>{t('itemSurpriseLabel')}</span>
        </label>
      </div>
      <p className="meta item-hint" id={`${id}-surprise-hint`}>
        {hasMember ? t('itemSurpriseHint') : t('err_invalid_payload_surprise_needs_member')}
      </p>
      {upload.error !== null && (
        <p className="error" role="alert">
          {upload.error}
        </p>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={blocked}>
          {t('itemSave')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
