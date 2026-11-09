import { TROPHY_EFFECTS, type TrophyEffect } from '@quiz/shared';
import { useId, useRef, type JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { reducedMotion } from '../../motion';
import { GLOW_DEFAULT } from '../../trophy/effect-plan';
import type { ToolProps } from '../PrizeStudio';
import { ColorField } from './ColorField';

/**
 * «Ефекти»: шість ефектів радіогрупою, для сяйва ще й колір. Колір сяйва пам'ятаємо, поки інструмент відкритий:
 * дія `effect` для glow без кольору скидає його до типового, тож повторний вибір сяйва передає останній.
 */
export function EffectTool({ draft, dispatch }: ToolProps): JSX.Element {
  const name = useId();
  const effect = draft.decor.effect;
  const lastGlow = useRef(effect.kind === 'glow' ? (effect.color ?? GLOW_DEFAULT) : GLOW_DEFAULT);
  if (effect.kind === 'glow' && effect.color !== undefined) lastGlow.current = effect.color;

  const pick = (kind: TrophyEffect) => dispatch(kind === 'glow' ? { type: 'effect', kind, color: lastGlow.current } : { type: 'effect', kind });

  return (
    <div className="studio-tool">
      <fieldset className="studio-choice">
        <legend>{t('studioToolEffects')}</legend>
        {TROPHY_EFFECTS.map((kind) => (
          <label key={kind}>
            <input type="radio" name={name} checked={effect.kind === kind} onChange={() => pick(kind)} />
            {t(`studioEffect_${kind}` as TextKey)}
          </label>
        ))}
      </fieldset>
      {effect.kind === 'glow' && (
        <ColorField label={t('studioGlowColor')} value={effect.color ?? GLOW_DEFAULT} onChange={(color) => dispatch({ type: 'effect', kind: 'glow', color })} />
      )}
      {reducedMotion() && <p className="meta">{t('studioCalmNote')}</p>}
    </div>
  );
}
