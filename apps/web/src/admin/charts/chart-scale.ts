import { t } from '../../i18n';
import { intlTag } from '../../locales/current';

/** 71: чисті функції графіків адмінки — шкали, підписи осей, числа. */

export interface Ticks {
  /** Верх шкали (остання поділка). */
  max: number;
  /** Поділки від 0 до max включно. */
  ticks: number[];
}

/** Кроки шкали в межах одного порядку: «гарні» числа; дробові кроки (2,5 на одиницях) пропускаються — лічильники цілі. */
const STEP_FACTORS = [1, 2, 2.5, 4, 5];
/** Кроки для відсотків: шкала завжди 0…100. */
const PERCENT_STEPS = [25, 50, 100];

/**
 * «Гарні» поділки осі Y від 0: найменший крок, з яким вистачає щонайбільше `count` проміжків.
 * Відсотки — завжди до 100 (крок 25 / 50 / 100). Самі нулі — шкала 0…1, щоб вісь не схлопувалась.
 */
export function niceTicks(max: number, count: number, options: { percent?: boolean } = {}): Ticks {
  const intervals = Math.max(1, Math.floor(count));
  if (options.percent) {
    const step = PERCENT_STEPS.find((one) => 100 / one <= intervals) ?? 100;
    return { max: 100, ticks: range(100 / step + 1, step) };
  }
  // Нескінченність чи NaN не мають «гарного» кроку: цикл нижче не скінчився б.
  if (!Number.isFinite(max) || !(max > 0)) return { max: 1, ticks: [0, 1] };
  for (let power = 1; ; power *= 10) {
    for (const factor of STEP_FACTORS) {
      const step = factor * power;
      if (!Number.isInteger(step)) continue;
      const parts = Math.ceil(max / step);
      if (parts <= intervals) return { max: parts * step, ticks: range(parts + 1, step) };
    }
  }
}

function range(length: number, step: number): number[] {
  return Array.from({ length }, (_, index) => index * step);
}

/** Значення, що малюється: скінченне й більше за нуль (NaN, нескінченність і від'ємні — як прогалина). */
export const drawable = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Ширина рядка в px — оцінка з запасом (0,62 em на знак): SVG-текст до розкладки не виміряти. */
export function textWidth(text: string, fontPx: number): number {
  return Math.ceil([...text].length * fontPx * 0.62);
}

/** Підпис під віссю X: x — у px від лівого краю області стовпчиків. */
export interface XLabel {
  index: number;
  x: number;
  anchor: 'start' | 'middle' | 'end';
}
/** Найменший просвіт між рамками сусідніх підписів, px. */
const X_LABEL_SPACE = 6;

/**
 * Які стовпчики підписати під віссю X і де: підпис — по центру стовпчика, а крайній, що вилазить за край області
 * (ширина `width`), притиснутий до краю (start / end). Між рамками підписів (ширина `labelWidth`) — щонайменше 6 px,
 * центри — не ближче за `minGap`. Перший — завжди; останній — завжди, коли влазить (замінює сусідів, що заважають).
 */
export function xLabelLayout(count: number, width: number, labelWidth: number, minGap = 0): XLabel[] {
  if (count <= 0) return [];
  const slot = width / count;
  const half = labelWidth / 2;
  const place = (index: number) => {
    const centre = (index + 0.5) * slot;
    if (centre - half < 0) return { index, x: 0, anchor: 'start' as const, left: 0, right: labelWidth };
    if (centre + half > width) return { index, x: width, anchor: 'end' as const, left: width - labelWidth, right: width };
    return { index, x: centre, anchor: 'middle' as const, left: centre - half, right: centre + half };
  };
  type Placed = ReturnType<typeof place>;
  const fits = (before: Placed, after: Placed) => after.left >= before.right + X_LABEL_SPACE;
  const out: Placed[] = [place(0)];
  if (count > 1) {
    const step = Math.max(1, Math.ceil(Math.max(minGap, labelWidth + X_LABEL_SPACE) / slot));
    for (let index = step; index < count - 1; ) {
      const next = place(index);
      // Притиснутий до краю перший підпис ширший за пів кроку: наступний зсуваємо праворуч до першого, що влазить.
      if (!fits(out[out.length - 1]!, next)) {
        index += 1;
        continue;
      }
      out.push(next);
      index += step;
    }
    const last = place(count - 1);
    while (out.length > 1 && !fits(out[out.length - 1]!, last)) out.pop();
    if (fits(out[out.length - 1]!, last)) out.push(last);
  }
  return out.map(({ index, x, anchor }) => ({ index, x, anchor }));
}

/** «1,2 тис.»: компактне число мовою інтерфейсу. */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat(intlTag(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Число з десятковими мовою інтерфейсу (за замовчуванням — до одного знака). */
export function decimalNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat(intlTag(), { maximumFractionDigits: digits }).format(value);
}

/** «45 хв», «1 год 20 хв»: хвилини, округлені до цілих. */
export function minutesText(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return t('chartMinutesValue', { value: whole });
  return t('chartHoursMinutes', { hours: Math.floor(whole / 60), minutes: whole % 60 });
}

/** «50 %» мовою інтерфейсу. */
export function percentText(value: number): string {
  return t('chartPercentValue', { value: decimalNumber(value) });
}

/** Зміна частки до попереднього, процентні пункти (до 0,1); null — одне з двох невідоме. */
export function deltaPoints(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

/** «10 п.п.» мовою інтерфейсу. */
export function pointsText(value: number): string {
  return t('chartPointsValue', { value: decimalNumber(value) });
}

/** Зміна до попереднього, % (ціле); null — попереднє нульове або невідоме. */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** 'YYYY-MM-DD' (календарний день, без поясу) → Date опівдні UTC. */
function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** «19 лист.»: короткий підпис дня. */
export function shortDay(day: string): string {
  return new Intl.DateTimeFormat(intlTag(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dayDate(day));
}

/** День, `days` днів після `day` ('YYYY-MM-DD'). */
export function addDays(day: string, days: number): string {
  const date = dayDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Підпис стовпчика під віссю: день — «19 лист.», тиждень — «з 17 лист.». */
export function bucketLabel(start: string, bucket: 'day' | 'week'): string {
  return bucket === 'week' ? t('chartWeekOf', { date: shortDay(start) }) : shortDay(start);
}

/** Підказка стовпчика: день — «19 лист.», кілька днів — «17 лист. – 23 лист.». */
export function bucketRange(start: string, days: number): string {
  if (days <= 1) return shortDay(start);
  return t('chartWeekRange', { from: shortDay(start), to: shortDay(addDays(start, days - 1)) });
}
