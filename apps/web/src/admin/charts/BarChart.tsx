import { useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { t } from '../../i18n';
import { compactNumber, decimalNumber, minutesText, niceTicks, percentText, xLabelIndexes } from './chart-scale';
import { useWidth } from './useWidth';

/** 71: стовпчики в реальних px (ширина — контейнер), з осями, сіткою, підказкою й таблицею тих самих чисел. */

export type ChartUnit = 'count' | 'percent' | 'minutes' | 'decimal';
export type ChartSize = 'small' | 'large';
export type ChartView = 'chart' | 'table';
export interface ChartLabel {
  /** Під віссю: «19 лист.», «з 17 лист.», «09». */
  short: string;
  /** У підказці й таблиці: «19 лист.», «17 лист. – 23 лист.». */
  full: string;
}
export interface ChartSeries {
  key: string;
  label: string;
  color: 1 | 2 | 3;
  values: (number | null)[];
}
export interface BarChartProps {
  title: string;
  titleId: string;
  labels: ChartLabel[];
  series: ChartSeries[];
  unit: ChartUnit;
  size: ChartSize;
  /** Лінія середнього в діалозі (за замовчуванням — так; для відсотків її немає ніколи). */
  average?: boolean;
  /** Найменша відстань між підписами осі X, px (для коротких підписів годин — менша). */
  labelGap?: number;
  view?: ChartView;
}

const LEFT = 40;
const BOTTOM = 22;
/** Над стовпчиками в діалозі — місце для чисел. */
const TOP = { small: 8, large: 22 } as const;
const HEIGHT_SMALL = 180;
const HEIGHT_LARGE_MAX = 448;
/** Скільки проміжків осі Y щонайбільше: у картці — 3 поділки (0, середина, верх), у діалозі — до 6. */
const TICKS = { small: 2, large: 5 } as const;
/** Числа над стовпчиками — лише коли на стовпчик припадає стільки px. */
const VALUE_MIN_SLOT = 22;
/** Плашку не притискаємо до краю: центр щонайменше на такій відстані. */
const TIP_EDGE = 64;

/** Значення стовпчика для підказки й таблиці. */
export function chartValueText(value: number, unit: ChartUnit): string {
  switch (unit) {
    case 'percent':
      return percentText(value);
    case 'minutes':
      return minutesText(value);
    case 'decimal':
      return decimalNumber(value);
    default:
      return decimalNumber(value, 0);
  }
}

/** Підпис поділки осі Y: компактно; відсотки — «50 %». */
function tickText(value: number, unit: ChartUnit): string {
  return unit === 'percent' ? percentText(value) : compactNumber(value);
}

/** Сума рядів кошика; null — у кошику немає жодного значення. */
function totalAt(series: ChartSeries[], index: number): number | null {
  let sum: number | null = null;
  for (const one of series) {
    const value = one.values[index];
    if (value !== null && value !== undefined) sum = (sum ?? 0) + value;
  }
  return sum;
}

/** Самі нулі й прогалини — малювати нічого. */
export function isEmptyChart(series: ChartSeries[]): boolean {
  return series.every((one) => one.values.every((value) => value === null || value === 0));
}

function largeHeight(): number {
  const viewport = typeof window === 'undefined' ? HEIGHT_LARGE_MAX : window.innerHeight * 0.6;
  return Math.round(Math.max(HEIGHT_SMALL, Math.min(viewport, HEIGHT_LARGE_MAX)));
}

/** Таблиця тих самих чисел: прихована для читачів екрана в картці, видима в діалозі. */
export function ChartTable({ title, labels, series, unit, visible }: { title: string; labels: ChartLabel[]; series: ChartSeries[]; unit: ChartUnit; visible: boolean }): JSX.Element {
  const single = series.length === 1;
  const table = (
    <table className={visible ? 'chart-table' : 'sr-only'}>
      <caption className={visible ? 'sr-only' : undefined}>{title}</caption>
      <thead>
        <tr>
          <th scope="col">{t('adminChartDay')}</th>
          {series.map((one) => (
            <th key={one.key} scope="col">
              {single ? t('adminChartValue') : one.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, index) => (
          <tr key={index}>
            <td>{label.full}</td>
            {series.map((one) => {
              const value = one.values[index];
              return <td key={one.key}>{value === null || value === undefined ? '—' : chartValueText(value, unit)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return visible ? <div className="chart-table-wrap">{table}</div> : table;
}

export function BarChart(props: BarChartProps): JSX.Element {
  const { title, labels, series, unit, view = 'chart' } = props;
  if (isEmptyChart(series)) return <p className="meta">{t('adminChartNoData')}</p>;
  if (view === 'table') return <ChartTable title={title} labels={labels} series={series} unit={unit} visible />;
  return (
    <>
      <Plot {...props} />
      {series.length > 1 && <Legend series={series} unit={unit} />}
      <ChartTable title={title} labels={labels} series={series} unit={unit} visible={false} />
    </>
  );
}

function Legend({ series, unit }: { series: ChartSeries[]; unit: ChartUnit }): JSX.Element {
  return (
    <ul className="chart-legend">
      {series.map((one) => {
        const sum = one.values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
        return (
          <li key={one.key}>
            <span className={`chart-swatch is-s${one.color}`} aria-hidden="true" />
            <span>
              {one.label} — {chartValueText(sum, unit)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Plot({ titleId, labels, series, unit, size, average = true, labelGap = 56 }: BarChartProps): JSX.Element {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const count = labels.length;
  const height = size === 'large' ? largeHeight() : HEIGHT_SMALL;
  const top = TOP[size];
  const bottom = height - BOTTOM;
  const plot = Math.max(1, width - LEFT);
  const slot = plot / Math.max(1, count);
  const bar = Math.max(1, slot * 0.7);
  const percent = unit === 'percent';
  const totals = labels.map((_, index) => totalAt(series, index));
  const scale = niceTicks(Math.max(0, ...totals.map((value) => value ?? 0)), TICKS[size], { percent });
  const y = (value: number) => bottom - ((bottom - top) * Math.min(value, scale.max)) / scale.max;
  const present = totals.filter((value): value is number => value !== null);
  const mean = size === 'large' && average && !percent && present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null;
  const showValues = size === 'large' && slot >= VALUE_MIN_SLOT;
  const xLabels = xLabelIndexes(count, plot, labelGap);
  const centre = (index: number) => LEFT + (index + 0.5) * slot;

  const valueAt = (one: ChartSeries, index: number) => {
    const value = one.values[index];
    return value === null || value === undefined ? '—' : chartValueText(value, unit);
  };
  const tipLines = (index: number): string[] => (series.length === 1 ? [valueAt(series[0]!, index)] : series.map((one) => `${one.label}: ${valueAt(one, index)}`));
  const tipText = (index: number) => `${labels[index]!.full}: ${tipLines(index).join('; ')}`;

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const current = active ?? count - 1;
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: count - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(count - 1, next)));
  };

  return (
    <div ref={ref} className="chart-plot">
      <svg
        className="chart-svg"
        width={width}
        height={height}
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        onFocus={() => {
          setFocused(true);
          setActive((now) => now ?? count - 1);
        }}
        onBlur={() => {
          setFocused(false);
          setActive(null);
        }}
        onKeyDown={onKeyDown}
        onMouseLeave={() => {
          if (!focused) setActive(null);
        }}
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid-line" x1={LEFT} x2={width} y1={Math.round(y(tick)) + 0.5} y2={Math.round(y(tick)) + 0.5} />
            <text x={LEFT - 6} y={y(tick)} dy="0.35em" textAnchor="end">
              {tickText(tick, unit)}
            </text>
          </g>
        ))}
        {active !== null && <rect className="chart-band" x={LEFT + active * slot} y={top} width={slot} height={bottom - top} />}
        {labels.map((_, index) => {
          let base = 0;
          const x = LEFT + index * slot + (slot - bar) / 2;
          return (
            <g key={index}>
              {series.map((one) => {
                const value = one.values[index];
                if (value === null || value === undefined || value <= 0) return null;
                const y0 = y(base);
                base += value;
                const h = Math.max(1, y0 - y(base));
                return (
                  <rect
                    key={one.key}
                    className={`chart-bar is-s${one.color}${series.length > 1 ? ' is-stacked' : ''}${active === index ? ' is-active' : ''}`}
                    data-series={one.key}
                    x={x}
                    y={y0 - h}
                    width={bar}
                    height={h}
                  />
                );
              })}
              {showValues && totals[index] !== null && totals[index] !== 0 && (
                <text className="chart-value" x={centre(index)} y={y(totals[index]!) - 4} textAnchor="middle">
                  {tickText(totals[index]!, unit)}
                </text>
              )}
            </g>
          );
        })}
        <line className="chart-axis" x1={LEFT} x2={width} y1={bottom + 0.5} y2={bottom + 0.5} />
        {mean !== null && (
          <g>
            <line className="chart-avg" x1={LEFT} x2={width} y1={y(mean)} y2={y(mean)} />
            <text className="chart-avg-label" x={width} y={y(mean) - 4} textAnchor="end">
              {t('chartAverage', { value: chartValueText(mean, unit === 'minutes' ? 'minutes' : 'decimal') })}
            </text>
          </g>
        )}
        {xLabels.map((index) => {
          const first = index === 0 && count > 1;
          const last = index === count - 1 && count > 1;
          const x = first ? LEFT + index * slot + (slot - bar) / 2 : last ? LEFT + index * slot + (slot + bar) / 2 : centre(index);
          return (
            <text key={index} className="chart-x" x={x} y={height - 6} textAnchor={first ? 'start' : last ? 'end' : 'middle'}>
              {labels[index]!.short}
            </text>
          );
        })}
        {labels.map((_, index) => (
          <rect
            key={index}
            className="chart-hit"
            x={LEFT + index * slot}
            y={0}
            width={slot}
            height={height}
            fill="transparent"
            onMouseEnter={() => setActive(index)}
            onClick={() => setActive(index)}
          />
        ))}
      </svg>
      {active !== null && (
        <div className="chart-tip" style={{ left: `${Math.max(Math.min(TIP_EDGE, width / 2), Math.min(width - Math.min(TIP_EDGE, width / 2), centre(active)))}px`, transform: 'translateX(-50%)' }} aria-hidden="true">
          <p>{labels[active]!.full}</p>
          <ul>
            {tipLines(active).map((line, index) => (
              <li key={index}>
                <strong>{line}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {focused && active !== null ? tipText(active) : ''}
      </p>
    </div>
  );
}
