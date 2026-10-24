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
  /** Рядків підписів: позначки, що не вмістилися, лишаються крапками без імені. */
  maxRows?: number;
}

/** Шкала повзунка на розкритті: смуга допуску, межі нуля, правильне значення й шпильки гравців. */
export function SliderScale({ slider, correct, tolerance, zeroBeyond, marks, highlight, maxRows = 3 }: Props) {
  const { min, max } = slider;
  const toleranceLeft = scalePct(correct - tolerance, min, max);
  const toleranceRight = scalePct(correct + tolerance, min, max);
  const zeroLeft = zeroBeyond === undefined ? 0 : scalePct(correct - zeroBeyond, min, max);
  const zeroRight = zeroBeyond === undefined ? 0 : scalePct(correct + zeroBeyond, min, max);
  const laid = layoutMarks(marks, min, max, undefined, maxRows, (mark) => mark.playerId === highlight);
  const named = laid.filter((mark) => mark.row !== null);
  const extra = laid.filter((mark) => mark.row === null);
  const rows = named.reduce((most, mark) => Math.max(most, (mark.row ?? 0) + 1), 0);
  const correctPct = scalePct(correct, min, max);
  return (
    <div className="slider-scale" style={{ ['--mark-rows' as string]: rows }}>
      <div className="scale-axis">
        {zeroBeyond !== undefined && <span className="scale-zero" style={{ left: `${zeroLeft}%`, width: `${zeroRight - zeroLeft}%` }} />}
        <span className="scale-tolerance" style={{ left: `${toleranceLeft}%`, width: `${toleranceRight - toleranceLeft}%` }} />
        {extra.map((mark) => (
          <span key={mark.playerId} className={mark.playerId === highlight ? 'scale-dot is-near' : 'scale-dot'} style={{ left: `${mark.pct}%` }} role="img" aria-label={`${mark.nickname}: ${sliderValueText(mark.value, slider)}`} />
        ))}
        <span className="scale-correct" style={{ left: `${correctPct}%` }}>
          <span className="scale-correct-label" style={{ transform: `translateX(-${correctPct}%)` }}>{sliderValueText(correct, slider)}</span>
        </span>
      </div>
      <div className="scale-limits">
        <span>{sliderNumber(min, slider.step)}</span>
        {extra.length > 0 && <span className="scale-more">{`+${extra.length}`}</span>}
        <span>{sliderNumber(max, slider.step)}</span>
      </div>
      <div className="scale-marks">
        {named.map((mark) => (
          <span
            key={mark.playerId}
            role="img"
            className={mark.playerId === highlight ? 'scale-mark is-near' : 'scale-mark'}
            style={{ left: `${mark.pct}%`, top: `calc(${mark.row} * var(--row-h))` }}
            aria-label={`${mark.nickname}: ${sliderValueText(mark.value, slider)}`}
          >
            <span className="scale-pin" aria-hidden="true" />
            <span className="scale-name" aria-hidden="true" style={{ transform: `translateX(-${mark.pct}%)` }}>
              {mark.nickname}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
