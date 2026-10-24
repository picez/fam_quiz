import type { PublicSlider } from '@quiz/shared';
import { sliderNumber, sliderValueText } from '../format';
import { layoutMarks, scalePct } from '../slider-scale';

interface Mark {
  playerId: string;
  nickname: string;
  value: number;
}

interface Props {
  slider: PublicSlider;
  correct: number;
  tolerance: number;
  zeroBeyond?: number;
  marks: Mark[];
  /** Підсвітити найближчого (сцена) або себе (телефон): id гравця. */
  highlight?: string;
}

/** Шкала повзунка на розкритті: смуга допуску, межі нуля, правильне значення й шпильки гравців. */
export function SliderScale({ slider, correct, tolerance, zeroBeyond, marks, highlight }: Props) {
  const { min, max } = slider;
  const toleranceLeft = scalePct(correct - tolerance, min, max);
  const toleranceRight = scalePct(correct + tolerance, min, max);
  const zeroLeft = zeroBeyond === undefined ? 0 : scalePct(correct - zeroBeyond, min, max);
  const zeroRight = zeroBeyond === undefined ? 0 : scalePct(correct + zeroBeyond, min, max);
  const laid = layoutMarks(marks, min, max);
  const rows = laid.reduce((most, mark) => Math.max(most, mark.row + 1), 0);
  return (
    <div className="slider-scale" style={{ ['--mark-rows' as string]: rows }}>
      <div className="scale-axis">
        {zeroBeyond !== undefined && <span className="scale-zero" style={{ left: `${zeroLeft}%`, width: `${zeroRight - zeroLeft}%` }} />}
        <span className="scale-tolerance" style={{ left: `${toleranceLeft}%`, width: `${toleranceRight - toleranceLeft}%` }} />
        <span className="scale-correct" style={{ left: `${scalePct(correct, min, max)}%` }}>
          <span className="scale-correct-label">{sliderValueText(correct, slider)}</span>
        </span>
      </div>
      <div className="scale-limits">
        <span>{sliderNumber(min, slider.step)}</span>
        <span>{sliderNumber(max, slider.step)}</span>
      </div>
      <div className="scale-marks">
        {laid.map((mark) => (
          <span
            key={mark.playerId}
            className={mark.playerId === highlight ? 'scale-mark is-near' : 'scale-mark'}
            style={{ left: `${mark.pct}%`, top: `calc(${mark.row} * var(--row-h))` }}
            aria-label={`${mark.nickname}: ${sliderValueText(mark.value, slider)}`}
          >
            <span className="scale-pin" aria-hidden="true" />
            <span className="scale-name" aria-hidden="true">{mark.nickname}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
