import { useState } from 'react';
import type { Answer, PublicQuestion, PublicSlider } from '@quiz/shared';
import { sliderNumber, sliderValueText, stepDecimals } from '../format';
import { t } from '../i18n';

interface Props {
  question: PublicQuestion & { slider: PublicSlider };
  onSubmit: (answer: Answer) => void;
  submitLabel?: string;
}

/** Округлення до знаків кроку: 0,1 × 10 без «0,9999999». */
function snap(value: number, step: number): number {
  return Number(value.toFixed(Math.min(stepDecimals(step), 20)));
}

/** Повзунок: велике число, кнопки «−»/«+» на один крок для точного налаштування одним пальцем, «Відповісти». */
export function SliderInput({ question, onSubmit, submitLabel }: Props) {
  const { min, max, step } = question.slider;
  const [value, setValue] = useState(() => snap(min + Math.round((max - min) / 2 / step) * step, step));
  const move = (delta: number) => setValue((now) => Math.min(max, Math.max(min, snap(now + delta, step))));
  const stepText = sliderNumber(step, step);

  return (
    <div className="slider-input">
      <output className="slider-value" aria-live="polite">
        {sliderValueText(value, question.slider)}
      </output>
      <div className="slider-row">
        <button type="button" className="btn btn-icon slider-step" aria-label={t('sliderLess', { step: stepText })} disabled={value <= min} onClick={() => move(-step)}>
          −
        </button>
        <input
          type="range"
          aria-label={t('sliderLabel')}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => setValue(Math.min(max, Math.max(min, snap(Number(event.target.value), step))))}
        />
        <button type="button" className="btn btn-icon slider-step" aria-label={t('sliderMore', { step: stepText })} disabled={value >= max} onClick={() => move(step)}>
          +
        </button>
      </div>
      <div className="slider-bounds" aria-hidden="true">
        <span>{sliderNumber(min, step)}</span>
        <span>{sliderNumber(max, step)}</span>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => onSubmit({ type: 'slider', value })}>
        {submitLabel ?? t('submit')}
      </button>
    </div>
  );
}
