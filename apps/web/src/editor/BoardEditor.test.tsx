// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BoardRound } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { BoardEditor } from './BoardEditor';
import { newBoardRound, newSpare } from './draft';

afterEach(cleanup);

const names = ['Спорт', 'Міста', 'Річки'];
const boardWith = (sparesOfFirst: number): BoardRound => {
  const round = newBoardRound();
  return {
    ...round,
    categories: round.categories.map((category, i) => ({
      ...category,
      title: names[i],
      ...(i === 0 && sparesOfFirst > 0 ? { spares: Array.from({ length: sparesOfFirst }, () => newSpare('single')) } : {}),
    })),
  };
};

describe('BoardEditor category spares (9d)', () => {
  it('the picked category has its own spares section: add a spare, five at most, no time, points or hint', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BoardEditor round={boardWith(0)} onChange={onChange} />);
    const section = screen.getByRole('region', { name: 'Запасні категорії «Спорт»' });
    fireEvent.click(within(section).getByRole('button', { name: t('addSpare') }));
    const next = onChange.mock.calls[0][0] as BoardRound;
    expect(next.categories[0].spares).toHaveLength(1);
    expect(next.categories[0].spares?.[0].type).toBe('single');

    rerender(<BoardEditor round={boardWith(5)} onChange={onChange} />);
    const full = screen.getByRole('region', { name: 'Запасні категорії «Спорт»' });
    expect((within(full).getByRole('button', { name: t('addSpare') }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(full).queryByLabelText('Час, с')).toBeNull();
    expect(within(full).queryByLabelText('Бали')).toBeNull();
    expect(within(full).queryByLabelText('Підказка')).toBeNull();
  });

  it("picking a cell of another category shows that category's spares", () => {
    render(<BoardEditor round={boardWith(0)} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Категорія 2/ })[0]);
    expect(screen.getByRole('region', { name: 'Запасні категорії «Міста»' })).toBeTruthy();
  });

  it('warns about a category without spares when swap is on; explains the legacy board', () => {
    const { rerender } = render(<BoardEditor round={boardWith(2)} onChange={vi.fn()} swapOn legacySpares={false} />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Категорія 2/ })[0]);
    expect(screen.getByText(t('categorySparesNone'))).toBeTruthy();
    rerender(<BoardEditor round={boardWith(0)} onChange={vi.fn()} swapOn legacySpares />);
    expect(screen.getByText(t('categorySparesLegacy'))).toBeTruthy();
    expect(screen.queryByText(t('categorySparesNone'))).toBeNull();
    rerender(<BoardEditor round={boardWith(0)} onChange={vi.fn()} swapOn={false} legacySpares />);
    expect(screen.queryByText(t('categorySparesLegacy'))).toBeNull();
    expect(screen.queryByText(t('categorySparesNone'))).toBeNull();
  });

  it('a column with spares shows the badge', () => {
    render(<BoardEditor round={boardWith(2)} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Запасних: 2')).toBeTruthy();
  });
});
