import {
  PRIZE_LIMITS,
  TROPHY_KINDS,
  TROPHY_MATERIALS,
  prizeContentSchema,
  type PrizeContent,
  type TrophyKind,
  type TrophyMaterial,
} from '@quiz/shared';
import { useState, type JSX } from 'react';
import { ImageField } from '../editor/ImageField';
import { t, type TextKey } from '../i18n';
import { TrophyView } from '../trophy/TrophyView';
import { TROPHY_EMOJI } from '../trophy/trophy-meta';

export interface PrizeEditorProps {
  initial: PrizeContent | null;
  busy: boolean;
  onSave: (content: PrizeContent) => void;
  onCancel: () => void;
}

/** Що не так із призом: текст першої помилки або null, коли приз готовий. */
function problem(content: PrizeContent, anyOption: boolean): string | null {
  if (!anyOption) return t('err_prize_empty');
  if (prizeContentSchema.safeParse(content).success) return null;
  return content.name.trim() === '' ? t('prizeNameRequired') : t('prizeFillOptions');
}

/** Форма призу: назва й шість опцій; вимкнена опція в зміст не потрапляє, навіть коли в полі лишився текст. */
export function PrizeEditor({ initial, busy, onSave, onCancel }: PrizeEditorProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [trophyOn, setTrophyOn] = useState(initial?.trophy != null);
  const [kind, setKind] = useState<TrophyKind>(initial?.trophy?.kind ?? 'cup');
  const [material, setMaterial] = useState<TrophyMaterial>(initial?.trophy?.material ?? 'gold');
  const [engravingOn, setEngravingOn] = useState(initial?.engraving != null);
  const [engraving, setEngraving] = useState(initial?.engraving ?? '');
  const [realOn, setRealOn] = useState(initial?.real != null);
  const [realText, setRealText] = useState(initial?.real?.text ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.real?.photoUrl ?? null);
  const [titleOn, setTitleOn] = useState(initial?.title != null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [diploma, setDiploma] = useState(initial?.diploma ?? false);
  // Тимчасово (до задачі 8 плану 25c, що прибирає цей редактор): грааль видно лише призу, що вже ним є, — щоб його можна було перейменувати, не втративши трофея.
  const initialKind = initial?.trophy?.kind;
  const kinds = TROPHY_KINDS.filter((value) => value !== 'grail' || value === initialKind);

  const content: PrizeContent = {
    name,
    trophy: trophyOn ? { ...initial?.trophy, kind, material } : null,
    engraving: engravingOn ? engraving : null,
    real: realOn ? { text: realText, photoUrl } : null,
    title: titleOn ? title : null,
    diploma,
  };
  const anyOption = trophyOn || engravingOn || realOn || titleOn || diploma;
  const issue = problem(content, anyOption);
  const parsed = issue === null ? prizeContentSchema.safeParse(content) : null;

  const check = (label: TextKey, on: boolean, set: (value: boolean) => void) => (
    <label className="field field-check">
      <input type="checkbox" checked={on} onChange={(event) => set(event.target.checked)} />
      {t(label)}
    </label>
  );

  return (
    <form
      className="prize-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed?.success) onSave(parsed.data);
      }}
    >
      <label className="field">
        {t('prizeName')}
        <input value={name} maxLength={PRIZE_LIMITS.name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="meta">{t('prizeNameHint')}</p>

      {check('prizeOptTrophy', trophyOn, setTrophyOn)}
      {trophyOn && (
        <div className="prize-part">
          <fieldset className="prize-choice">
            <legend>{t('prizeKind')}</legend>
            {kinds.map((value) => (
              <label key={value}>
                <input type="radio" name="prize-kind" checked={kind === value} onChange={() => setKind(value)} />
                <span aria-hidden="true">{TROPHY_EMOJI[value]}</span> {t(`trophy_${value}` as TextKey)}
              </label>
            ))}
          </fieldset>
          <fieldset className="prize-choice">
            <legend>{t('prizeMaterial')}</legend>
            {TROPHY_MATERIALS.map((value) => (
              <label key={value}>
                <input type="radio" name="prize-material" checked={material === value} onChange={() => setMaterial(value)} />
                {t(`material_${value}` as TextKey)}
              </label>
            ))}
          </fieldset>
          <div className="prize-preview">
            <TrophyView trophy={{ ...initial?.trophy, kind, material }} size="card" spin interactive={false} appear={false} />
          </div>
        </div>
      )}

      {check('prizeOptEngraving', engravingOn, setEngravingOn)}
      {engravingOn && (
        <label className="field">
          {t('prizeEngravingText')}
          <input value={engraving} maxLength={PRIZE_LIMITS.engraving} onChange={(event) => setEngraving(event.target.value)} />
        </label>
      )}

      {check('prizeOptReal', realOn, setRealOn)}
      {realOn && (
        <div className="prize-part">
          <label className="field">
            {t('prizeRealText')}
            <input value={realText} maxLength={PRIZE_LIMITS.realText} onChange={(event) => setRealText(event.target.value)} />
          </label>
          <ImageField url={photoUrl} onChange={setPhotoUrl} />
        </div>
      )}

      {check('prizeOptTitle', titleOn, setTitleOn)}
      {titleOn && (
        <label className="field">
          {t('prizeTitleText')}
          <input value={title} maxLength={PRIZE_LIMITS.title} onChange={(event) => setTitle(event.target.value)} />
        </label>
      )}

      {check('prizeOptDiploma', diploma, setDiploma)}

      <p className="meta">{t('prizeCeremonyNote')}</p>
      {issue !== null && <p className="error">{issue}</p>}
      <div className="toolbar">
        <button type="submit" className="btn btn-primary" disabled={issue !== null || busy}>
          {t('save')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
