import { useState } from 'react';
import type { Answer, SubmittedAnswer, PublicQuestion, PublicSlider } from '@quiz/shared';
import { sliderNumber, sliderValueText, stepDecimals } from '../format';
import { t } from '../i18n';

interface Props {
  question: PublicQuestion & { slider: PublicSlider };
  onSubmit: (answer: Answer) => void;
  submitLabel?: string;
  onDraft?: (draft: SubmittedAnswer | null) => void;
  /** «Бінокль» (12h): проміжок, де відповідь, — смуга над доріжкою. */
  band?: { min: number; max: number } | null;
}

/** Частка шкали у відсотках без хвостів (0,3 × 100 = 30,000000000000004). */
const pct = (share: number) => `${Math.round(Math.min(Math.max(share, 0), 1) * 10_000) / 100}%`;

/** Найближче вузол сітки min + k·step, округлене до знаків кроку й межі: 0,1 × 10 без «0,9999999». */
function snap(value: number, min: number, step: number): number {
  const digits = Math.min(Math.max(stepDecimals(step), stepDecimals(min)), 20);
  return Number((min + Math.round((value - min) / step) * step).toFixed(digits));
}

/** Повзунок: велике число, кнопки «−»/«+» на один крок для точного налаштування одним пальцем, «Відповісти». */
export function SliderInput({ question, onSubmit, submitLabel, onDraft, band = null }: Props) {
  const { min, max, step } = question.slider;
  const [value, setValue] = useState(() => snap(min + Math.round((max - min) / 2 / step) * step, min, step));
  const change = (next: number) => {
    setValue(next);
    onDraft?.({ type: 'slider', value: next });
  };
  const move = (delta: number) => change(Math.min(max, Math.max(min, snap(value + delta, min, step))));
  const stepText = sliderNumber(step, step);
  // Знаки після коми — як у кроку й у межі: min 0,5 з кроком 1 дає «2,5», а не «3».
  const digits = Math.max(stepDecimals(step), stepDecimals(min));
  const shown = { step: digits === 0 ? 1 : Number(`1e-${digits}`), unit: question.slider.unit };

  return (
    <div className="slider-input">
      <output className="slider-value">
        {sliderValueText(value, shown)}
      </output>
      <div className="slider-row">
        <button type="button" className="btn btn-icon slider-step" aria-label={t('sliderLess', { step: stepText })} disabled={value <= min} onClick={() => move(-step)}>
          −
        </button>
        <div className="slider-track">
          {band !== null && max > min && (
            // Рейка смуги відступає на пів повзунка з обох боків: так смуга стоїть під тими значеннями, куди стає повзунок.
            <span className="slider-band-rail" aria-hidden="true">
              <span className="slider-band" aria-hidden="true" style={{ left: pct((band.min - min) / (max - min)), width: pct((band.max - band.min) / (max - min)) }} />
            </span>
          )}
          <input
            type="range"
            aria-label={t('sliderLabel')}
            min={min}
            max={max}
            step={step}
            value={value}
            aria-valuetext={sliderValueText(value, shown)}
            onChange={(event) => change(Math.min(max, Math.max(min, snap(Number(event.target.value), min, step))))}
          />
        </div>
        <button type="button" className="btn btn-icon slider-step" aria-label={t('sliderMore', { step: stepText })} disabled={value >= max} onClick={() => move(step)}>
          +
        </button>
      </div>
      <div className="slider-bounds" aria-hidden="true">
        <span>{sliderNumber(min, shown.step)}</span>
        <span>{sliderNumber(max, shown.step)}</span>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => onSubmit({ type: 'slider', value })}>
        {submitLabel ?? t('submit')}
      </button>
    </div>
  );
}
