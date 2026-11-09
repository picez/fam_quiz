import { useId, type JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { STUDIO_SWATCHES } from '../studio-draft';

/**
 * Колір: швидкі зразки (радіо) і «Свій колір» — <input type="color">. Значення — #rrggbb.
 * typing у onChange — зміна з «Свого кольору»: тяг по палітрі шле десятки змін за секунду, тож кубку їх варто
 * віддавати, коли вони стихнуть (dispatch(action, true)). Дотик по зразку — false, одразу.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string, typing?: boolean) => void;
}): JSX.Element {
  const name = useId();
  const hex = value.toLowerCase();
  return (
    <fieldset className="studio-choice studio-colors">
      <legend>{label}</legend>
      {STUDIO_SWATCHES.map((swatch) => (
        <label key={swatch.id} className="studio-swatch" title={t(`swatch_${swatch.id}` as TextKey)}>
          <input
            type="radio"
            className="sr-only"
            name={name}
            checked={hex === swatch.hex}
            aria-label={t(`swatch_${swatch.id}` as TextKey)}
            onChange={() => onChange(swatch.hex, false)}
          />
          <span className="studio-swatch-dot" style={{ background: swatch.hex }} aria-hidden="true" />
        </label>
      ))}
      <label className="studio-swatch-custom">
        <input type="color" value={hex} onChange={(event) => onChange(event.target.value.toLowerCase(), true)} />
        {t('studioColorCustom')}
      </label>
    </fieldset>
  );
}
