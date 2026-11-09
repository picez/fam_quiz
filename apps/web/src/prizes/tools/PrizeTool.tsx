import { PRIZE_LIMITS } from '@quiz/shared';
import { useRef, type JSX } from 'react';
import { ImageField } from '../../editor/ImageField';
import { t } from '../../i18n';
import type { ToolProps } from '../PrizeStudio';
import { STUDIO_NAME_FIELD } from '../studio-draft';

/**
 * «Приз»: назва, підпис під кубком і на дипломі, справжній приз, титул, диплом. Порожній підпис чи титул — немає
 * (contentOf дає null). Справжній приз — перемикач, бо в нього ще й фото; вимкнений і знову ввімкнений — з тим самим текстом.
 */
export function PrizeTool({ draft, dispatch }: ToolProps): JSX.Element {
  const lastReal = useRef(draft.real ?? { text: '', photoUrl: null });
  if (draft.real !== null) lastReal.current = draft.real;
  return (
    <div className="studio-tool">
      <label className="field">
        {t('prizeName')}
        <input
          id={STUDIO_NAME_FIELD}
          value={draft.name}
          maxLength={PRIZE_LIMITS.name}
          aria-describedby="studio-name-hint"
          onChange={(event) => dispatch({ type: 'name', value: event.target.value }, true)}
        />
      </label>
      <p className="meta" id="studio-name-hint">
        {t('prizeNameHint')}
      </p>

      <label className="field">
        {t('studioEngraving')}
        <input value={draft.engraving} maxLength={PRIZE_LIMITS.engraving} onChange={(event) => dispatch({ type: 'engraving', value: event.target.value }, true)} />
      </label>

      <label className="field field-check">
        <input
          type="checkbox"
          checked={draft.real !== null}
          onChange={(event) => dispatch({ type: 'real', value: event.target.checked ? { ...lastReal.current } : null })}
        />
        {t('prizeOptReal')}
      </label>
      {draft.real !== null && (
        <div className="studio-part">
          <label className="field">
            {t('prizeRealText')}
            <input
              value={draft.real.text}
              maxLength={PRIZE_LIMITS.realText}
              onChange={(event) => dispatch({ type: 'real', value: { text: event.target.value, photoUrl: draft.real?.photoUrl ?? null } }, true)}
            />
          </label>
          {/* Фото може завантажитись, коли вкладку вже змінили: воно все одно лягає в чернетку (dispatch живе в PrizeStudio). */}
          <ImageField url={draft.real.photoUrl} keepLate onChange={(photoUrl) => dispatch({ type: 'realPhoto', photoUrl })} />
        </div>
      )}

      <fieldset className="studio-group">
        <legend>{t('prizeOptTitle')}</legend>
        <label className="field">
          {t('prizeTitleText')}
          <input value={draft.title} maxLength={PRIZE_LIMITS.title} onChange={(event) => dispatch({ type: 'title', value: event.target.value }, true)} />
        </label>
      </fieldset>

      <label className="field field-check">
        <input type="checkbox" checked={draft.diploma} onChange={(event) => dispatch({ type: 'diploma', value: event.target.checked })} />
        {t('prizeOptDiploma')}
      </label>

      <p className="meta">{t('prizeCeremonyNote')}</p>
    </div>
  );
}
