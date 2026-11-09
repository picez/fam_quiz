import { TROPHY_KINDS, TROPHY_MATERIALS } from '@quiz/shared';
import type { JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { TROPHY_EMOJI } from '../../trophy/trophy-meta';
import type { ToolProps } from '../PrizeStudio';
import { StickerPicker } from './StickerPicker';

/** «Форма»: вид трофея (шість і «Без трофея»), матеріал і наліпки на вільні місця форми; кубок на сцені змінюється одразу. */
export function ShapeTool({ draft, dispatch, level, stored }: ToolProps): JSX.Element {
  const kind = draft.trophy?.kind ?? null;
  return (
    <div className="studio-tool">
      <fieldset className="studio-choice">
        <legend>{t('prizeKind')}</legend>
        {TROPHY_KINDS.map((value) => (
          <label key={value}>
            <input type="radio" name="studio-kind" checked={kind === value} onChange={() => dispatch({ type: 'trophy', kind: value })} />
            <span aria-hidden="true">{TROPHY_EMOJI[value]}</span> {t(`trophy_${value}` as TextKey)}
          </label>
        ))}
        <label>
          <input type="radio" name="studio-kind" checked={kind === null} onChange={() => dispatch({ type: 'trophy', kind: null })} />
          <span aria-hidden="true">🎁</span> {t('studioNoTrophy')}
        </label>
      </fieldset>
      {draft.trophy !== null && (
        <fieldset className="studio-choice">
          <legend>{t('prizeMaterial')}</legend>
          {TROPHY_MATERIALS.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="studio-material"
                checked={draft.trophy?.material === value}
                onChange={() => dispatch({ type: 'material', material: value })}
              />
              {t(`material_${value}` as TextKey)}
            </label>
          ))}
        </fieldset>
      )}
      {draft.trophy !== null && (
        <section className="studio-group" aria-labelledby="studio-stickers-title">
          <h2 id="studio-stickers-title" className="studio-group-title">
            {t('studioStickers')}
          </h2>
          <StickerPicker
            kind={draft.trophy.kind}
            decor={draft.decor}
            level={level}
            kept={stored?.stickers.map((s) => s.id)}
            onPick={(place, id, from) => dispatch({ type: 'sticker', place, id, from })}
          />
        </section>
      )}
    </div>
  );
}
