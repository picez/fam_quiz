import { PREMIUM_KINDS, PREMIUM_MATERIALS, trophyUnlockLevel } from '@quiz/shared';
import type { JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { MATERIAL_GROUPS, MATERIAL_LOOK, TROPHY_EMOJI, TROPHY_GROUPS } from '../../trophy/trophy-meta';
import type { ToolProps } from '../PrizeStudio';
import { StickerPicker } from './StickerPicker';
import { TileMarks } from './TileMarks';

/**
 * «Форма»: вид трофея групами («Кубки», «Медалі», «Корони й вінки», «Статуетки») і «Без трофея», матеріал групами,
 * наліпки на вільні місця форми; кубок на сцені змінюється одразу. Нові форми й матеріали закриті до свого рівня,
 * як шрифти: збережене в цьому призі й поточне в чернетці лишаються чинними (як на сервері).
 */
export function ShapeTool({ draft, dispatch, level, stored, storedTrophy }: ToolProps): JSX.Element {
  const kind = draft.trophy?.kind ?? null;
  const material = draft.trophy?.material ?? null;
  // Підказка про «преміум» — один раз під виборами, і лише коли серед показаних плиток є преміум.
  // Плитки форм показано завжди (усі TROPHY_KINDS у групах), плитки матеріалів — лише з трофеєм.
  const premiumShown = PREMIUM_KINDS.length > 0 || (draft.trophy !== null && PREMIUM_MATERIALS.length > 0);
  return (
    <div className="studio-tool">
      <fieldset className="studio-choice studio-grouped">
        <legend>{t('prizeKind')}</legend>
        {TROPHY_GROUPS.map((group) => (
          <fieldset key={group.id} className="studio-choice studio-tiles">
            <legend>{t(`studioKindGroup_${group.id}` as TextKey)}</legend>
            {group.kinds.map((value) => {
              const need = trophyUnlockLevel('shape', value);
              const locked = need > level && storedTrophy?.kind !== value && kind !== value;
              return (
                <label key={value} className={locked ? 'is-locked' : undefined}>
                  <input type="radio" name="studio-kind" checked={kind === value} disabled={locked} onChange={() => dispatch({ type: 'trophy', kind: value })} />
                  <span aria-hidden="true">{TROPHY_EMOJI[value]}</span> {t(`trophy_${value}` as TextKey)}
                  <TileMarks need={need} locked={locked} premium={PREMIUM_KINDS.includes(value)} />
                </label>
              );
            })}
          </fieldset>
        ))}
        <label className="studio-no-trophy">
          <input type="radio" name="studio-kind" checked={kind === null} onChange={() => dispatch({ type: 'trophy', kind: null })} />
          <span aria-hidden="true">🎁</span> {t('studioNoTrophy')}
        </label>
      </fieldset>
      {draft.trophy !== null && (
        <fieldset className="studio-choice studio-grouped">
          <legend>{t('prizeMaterial')}</legend>
          {MATERIAL_GROUPS.map((group) => (
            <fieldset key={group.id} className="studio-choice studio-tiles">
              <legend>{t(`studioMaterialGroup_${group.id}` as TextKey)}</legend>
              {group.materials.map((value) => {
                const need = trophyUnlockLevel('material', value);
                const locked = need > level && storedTrophy?.material !== value && material !== value;
                return (
                  <label key={value} className={locked ? 'is-locked' : undefined}>
                    <input
                      type="radio"
                      name="studio-material"
                      checked={material === value}
                      disabled={locked}
                      onChange={() => dispatch({ type: 'material', material: value })}
                    />
                    <span className="studio-swatch-dot" style={{ backgroundColor: MATERIAL_LOOK[value].color }} aria-hidden="true" />
                    {t(`material_${value}` as TextKey)}
                    <TileMarks need={need} locked={locked} premium={PREMIUM_MATERIALS.includes(value)} />
                  </label>
                );
              })}
            </fieldset>
          ))}
        </fieldset>
      )}
      {premiumShown && <p className="meta">{t('studioPremiumHint')}</p>}
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
