// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HBarList } from './HBarList';

afterEach(cleanup);

describe('HBarList', () => {
  const items = [
    { key: 'a', name: 'Класика', value: 40 },
    { key: 'b', name: 'Блиц', value: 10, meta: 'сесій: 2' },
    { key: 'c', name: 'Аукціон', value: 0 },
  ];

  it('lists names and numbers with a bar share of the largest', () => {
    const { container } = render(<HBarList title="Типи раундів" items={items} />);
    const rows = within(container.querySelector('ol.hbar-list') as HTMLElement).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.hbar-name')?.textContent + ' — ' + row.querySelector('.hbar-value')?.textContent)).toEqual(['Класика — 40', 'Блиц — 10', 'Аукціон — 0']);
    expect(rows.map((row) => row.style.getPropertyValue('--share'))).toEqual(['1', '0.25', '0']);
    expect(within(rows[1]!).getByText('сесій: 2')).toBeTruthy();
  });

  it('shows only the first rows when limited and all of them in the table view', () => {
    const { container, rerender } = render(<HBarList title="Типи раундів" items={items} limit={2} />);
    expect(container.querySelectorAll('.hbar')).toHaveLength(2);
    rerender(<HBarList title="Типи раундів" items={items} limit={2} view="table" />);
    expect(within(container.querySelector('table.chart-table') as HTMLElement).getAllByRole('row')).toHaveLength(4);
  });

  it('says the period is empty', () => {
    render(<HBarList title="Типи раундів" items={[]} />);
    expect(screen.getByText('За цей період нічого немає.')).toBeTruthy();
  });
});
