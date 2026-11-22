// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarChart, isEmptyChart, type BarChartProps, type ChartSeries } from './BarChart';
import { niceTicks, textWidth, xLabelLayout } from './chart-scale';

const labels = (count: number) => Array.from({ length: count }, (_, n) => ({ short: `d${n}`, full: `day ${n}` }));
const single = (values: (number | null)[]): ChartSeries[] => [{ key: 'games', label: 'Ігри', color: 1, values }];

function show(over: Partial<BarChartProps> & { series: ChartSeries[] }) {
  const count = over.series[0]!.values.length;
  return render(
    <>
      <h3 id="t">Ігри за день</h3>
      <BarChart title="Ігри за день" titleId="t" labels={labels(count)} unit="count" size="small" {...over} />
    </>,
  );
}

/** ResizeObserver, що одразу повідомляє ширину `width` (jsdom не має розкладки). */
function stubWidth(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BarChart', () => {
  const values = Array.from({ length: 30 }, (_, n) => (n % 3 === 0 ? 0 : n % 7));

  it('draws a measured chart with the title, y grid, spaced x labels, one bar per non-zero value and a hidden table', () => {
    const { container } = show({ series: single(values) });
    const svg = screen.getByRole('img', { name: 'Ігри за день' });
    expect(svg.getAttribute('width')).toBe('320');
    const ticks = niceTicks(6, 2).ticks;
    expect(container.querySelectorAll('.chart-grid-line')).toHaveLength(ticks.length);
    expect(ticks).toHaveLength(3);
    const xs = [...container.querySelectorAll('.chart-x')].map((node) => node.textContent);
    // Поле осі Y — за найширшим підписом («6») + 8, але не менше 28.
    expect(xs).toEqual(xLabelLayout(30, 320 - 28, textWidth('d29', 12), 56).map(({ index }) => `d${index}`));
    expect(xs[0]).toBe('d0');
    expect(xs[xs.length - 1]).toBe('d29');
    expect(container.querySelectorAll('.chart-bar')).toHaveLength(values.filter((v) => v > 0).length);
    const table = container.querySelector('table.sr-only')!;
    expect(within(table as HTMLElement).getAllByRole('row')).toHaveLength(31);
    expect(container.querySelector('.chart-legend')).toBeNull();
  });

  it('stacks series in order with a legend of totals', () => {
    const series: ChartSeries[] = [
      { key: 'hosted', label: 'Людина', color: 1, values: [1, 2, 0] },
      { key: 'autopilot', label: 'Автопілот', color: 2, values: [3, 0, 1] },
      { key: 'bot', label: 'Бот', color: 3, values: [0, 4, 1] },
    ];
    const { container } = show({ series });
    const bars = [...container.querySelectorAll('.chart-bar')];
    expect(bars.map((bar) => bar.getAttribute('data-series'))).toEqual(['hosted', 'autopilot', 'hosted', 'bot', 'autopilot', 'bot']);
    // Перший сегмент стоїть нижче за другий.
    expect(Number(bars[0]!.getAttribute('y'))).toBeGreaterThan(Number(bars[1]!.getAttribute('y')));
    expect(bars.every((bar) => bar.classList.contains('is-stacked'))).toBe(true);
    const legend = [...container.querySelectorAll('.chart-legend li')].map((li) => li.textContent);
    expect(legend).toEqual(['Людина — 3', 'Автопілот — 4', 'Бот — 5']);
  });

  it('shows values above bars and the average line in a wide dialog', () => {
    stubWidth(900);
    const { container } = show({ series: single(values), size: 'large' });
    expect(screen.getByRole('img').getAttribute('width')).toBe('900');
    expect(container.querySelectorAll('.chart-value')).toHaveLength(values.filter((v) => v > 0).length);
    const present = values.filter((v) => v !== null);
    const mean = present.reduce((a, b) => a + b, 0) / present.length;
    expect(container.querySelector('.chart-avg-label')?.textContent).toBe(`сер. ${new Intl.NumberFormat('uk', { maximumFractionDigits: 1 }).format(mean)}`);
  });

  it('hides values when bars are narrow and has no average for percentages', () => {
    const many = Array.from({ length: 90 }, (_, n) => n % 50);
    const { container } = show({ series: single(many), size: 'large', unit: 'percent' });
    expect(container.querySelectorAll('.chart-value')).toHaveLength(0);
    expect(container.querySelector('.chart-avg')).toBeNull();
    expect([...container.querySelectorAll('.chart-svg > g > text')].map((node) => node.textContent)).toEqual(['0 %', '25 %', '50 %', '75 %', '100 %']);
  });

  it('moves the active bar with the keyboard and announces it', () => {
    const { container } = show({ series: single([1, 2, 3, 4]) });
    const svg = screen.getByRole('img');
    const live = container.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe('');
    fireEvent.focus(svg);
    expect(container.querySelector('.chart-tip')?.textContent).toBe('day 34');
    expect(live.textContent).toBe('day 3: 4');
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(live.textContent).toBe('day 2: 3');
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(live.textContent).toBe('day 0: 1');
    fireEvent.keyDown(svg, { key: 'ArrowLeft' });
    expect(live.textContent).toBe('day 0: 1');
    fireEvent.keyDown(svg, { key: 'End' });
    expect(live.textContent).toBe('day 3: 4');
    expect(container.querySelector('.chart-bar.is-active')).not.toBeNull();
    fireEvent.blur(svg);
    expect(container.querySelector('.chart-tip')).toBeNull();
    expect(live.textContent).toBe('');
  });

  it('shows the tooltip of the bar under the mouse', () => {
    const { container } = show({ series: single([1, null, 3]) });
    fireEvent.mouseEnter(container.querySelectorAll('.chart-hit')[1]!);
    expect(container.querySelector('.chart-tip')?.textContent).toBe('day 1—');
    fireEvent.mouseEnter(container.querySelectorAll('.chart-hit')[2]!);
    expect(container.querySelector('.chart-tip')?.textContent).toBe('day 23');
    fireEvent.mouseLeave(screen.getByRole('img'));
    expect(container.querySelector('.chart-tip')).toBeNull();
  });

  it('drops the hovered bar when a shorter period replaces the data under the mouse', () => {
    const element = (values: number[]) => (
      <>
        <h3 id="t">Ігри за день</h3>
        <BarChart title="Ігри за день" titleId="t" labels={labels(values.length)} unit="count" size="small" series={single(values)} />
      </>
    );
    const { container, rerender } = render(element([1, 2, 3, 4, 5]));
    fireEvent.mouseEnter(container.querySelectorAll('.chart-hit')[4]!);
    expect(container.querySelector('.chart-tip')?.textContent).toBe('day 45');
    rerender(element([1, 2]));
    expect(container.querySelector('.chart-tip')).toBeNull();
    expect(container.querySelector('.chart-band')).toBeNull();
  });

  it('treats NaN, infinity and negative values as gaps: no bar, no "NaN", not in the total', () => {
    const series: ChartSeries[] = [
      { key: 'a', label: 'А', color: 1, values: [NaN, 2, -3, Infinity] },
      { key: 'b', label: 'Б', color: 2, values: [1, 1, 1, 1] },
    ];
    const { container } = show({ series });
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('∞');
    expect([...container.querySelectorAll('.chart-bar')].map((bar) => bar.getAttribute('data-series'))).toEqual(['b', 'a', 'b', 'b', 'b']);
    const legend = [...container.querySelectorAll('.chart-legend li')].map((li) => li.textContent);
    expect(legend).toEqual(['А — 2', 'Б — 4']);
    // Шкала — за сумою 3 (2 + 1), а не за нескінченністю.
    expect([...container.querySelectorAll('.chart-svg > g > text')].map((node) => node.textContent)).toEqual(['0', '2', '4']);
    expect(isEmptyChart([{ key: 'x', label: 'x', color: 1, values: [NaN, -1, Infinity, 0, null] }])).toBe(true);
  });

  it('heads the table with the given label', () => {
    const { container } = show({ series: single([1, 2]), view: 'table', labelHeader: 'Тиждень' });
    expect(container.querySelector('th')?.textContent).toBe('Тиждень');
  });

  it('makes room on the left for long y labels', () => {
    stubWidth(400);
    const { container } = show({ series: single([1500, 300]) });
    const tickLabels = [...container.querySelectorAll('.chart-svg > g > text')];
    expect(tickLabels.at(-1)!.textContent!.replace(/\s/g, ' ')).toBe('2 тис.');
    const x = Number(tickLabels.at(-1)!.getAttribute('x'));
    // Підпис притиснутий праворуч до x: його ширина не більша за x (не вилазить за лівий край).
    expect(x).toBeGreaterThanOrEqual(textWidth('2 тис.', 12));
  });

  it('says there is no data instead of an empty frame', () => {
    const { container } = show({ series: single([0, null, 0]) });
    expect(screen.getByText('Немає даних за ці дні.')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows a visible table in the table view', () => {
    const { container } = show({ series: single([1, 50]), unit: 'percent', view: 'table' });
    expect(container.querySelector('svg')).toBeNull();
    const table = container.querySelector('table.chart-table') as HTMLElement;
    expect(within(table).getAllByRole('row').map((row) => row.textContent)).toEqual(['ДеньЗначення', 'day 01', 'day 150']);
  });
});
