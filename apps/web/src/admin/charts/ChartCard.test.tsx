// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart, isEmptyChart, type ChartSeries } from './BarChart';
import { ChartCard } from './ChartCard';

afterEach(cleanup);

const labels = [
  { short: '1', full: 'day 1' },
  { short: '2', full: 'day 2' },
];

function Card({ series }: { series: ChartSeries[] }) {
  return (
    <ChartCard title="Ігри за ведучим" hint="Підказка" empty={isEmptyChart(series)}>
      {({ size, titleId, view }) => <BarChart title="Ігри за ведучим" titleId={titleId} labels={labels} series={series} unit="count" size={size} view={view} />}
    </ChartCard>
  );
}

const series: ChartSeries[] = [{ key: 'games', label: 'Ігри', color: 1, values: [2, 5] }];

describe('ChartCard', () => {
  it('opens an accessible modal dialog with the same title and focus on «Закрити»', () => {
    render(<Card series={series} />);
    const expand = screen.getByRole('button', { name: 'Розгорнути «Ігри за ведучим»' });
    expect(screen.getByRole('img', { name: 'Ігри за ведучим' })).toBeTruthy();
    fireEvent.click(expand);
    const dialog = screen.getByRole('dialog', { name: 'Ігри за ведучим' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Закрити' }));
    expect(within(dialog).getByRole('img', { name: 'Ігри за ведучим' })).toBeTruthy();
    expect(within(dialog).getByText('Підказка')).toBeTruthy();
  });

  it('closes on Escape and returns focus to the expand button', () => {
    render(<Card series={series} />);
    const expand = screen.getByRole('button', { name: 'Розгорнути «Ігри за ведучим»' });
    expand.focus();
    fireEvent.click(expand);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(expand);
  });

  it('closes on a click on the backdrop but not on the card', () => {
    render(<Card series={series} />);
    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути «Ігри за ведучим»' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    // Натиск у картці, відпускання на тлі (виділяли текст) — не закриває.
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab inside the dialog and switches between chart and table', () => {
    render(<Card series={series} />);
    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути «Ігри за ведучим»' }));
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Закрити' });
    const toggle = within(dialog).getByRole('button', { name: 'Показати таблицею' });
    const chart = within(dialog).getByRole('img');
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(toggle);
    fireEvent.keyDown(toggle, { key: 'Tab' });
    expect(document.activeElement).toBe(chart);
    fireEvent.keyDown(chart, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(chart);

    fireEvent.click(toggle);
    expect(within(dialog).queryByRole('img')).toBeNull();
    const table = dialog.querySelector('table.chart-table') as HTMLElement;
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: 'Показати графіком' })).toBe(toggle);
  });

  it('has no expand button for an empty chart', () => {
    render(<Card series={[{ key: 'games', label: 'Ігри', color: 1, values: [0, null] }]} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Немає даних за ці дні.')).toBeTruthy();
  });
});
