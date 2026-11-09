import { TROPHY_APPEARANCES } from '@quiz/shared';
import { useEffect, useId, useRef, type JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { reducedMotion } from '../../motion';
import type { ToolProps } from '../PrizeStudio';

const CALM_NOTE = 'studio-calm-note';

/**
 * «Поява»: чотири анімації. Вибір одразу її програє (в ефекті після рендеру, коли кубок уже отримав новий вигляд),
 * «Показати появу» програє вибрану знову. Під «менше руху» не граємо нічого, кнопка вимкнена з поясненням.
 */
export function AppearTool({ draft, dispatch, replay }: ToolProps): JSX.Element {
  const name = useId();
  const calm = reducedMotion();
  const appearance = draft.decor.appearance;
  const shown = useRef(appearance);

  useEffect(() => {
    if (shown.current === appearance) return;
    shown.current = appearance;
    if (!reducedMotion()) replay();
  }, [appearance, replay]);

  return (
    <div className="studio-tool">
      <fieldset className="studio-choice">
        <legend>{t('studioToolAppear')}</legend>
        {TROPHY_APPEARANCES.map((kind) => (
          <label key={kind}>
            <input type="radio" name={name} checked={appearance === kind} onChange={() => dispatch({ type: 'appearance', appearance: kind })} />
            {t(`studioAppear_${kind}` as TextKey)}
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn" disabled={calm} aria-describedby={calm ? CALM_NOTE : undefined} onClick={replay}>
        {t('studioAppearPlay')}
      </button>
      {calm && (
        <p className="meta" id={CALM_NOTE}>
          {t('studioCalmNote')}
        </p>
      )}
    </div>
  );
}
