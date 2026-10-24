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

describe('BoardEditor help (10a)', () => {
  it('a cell has ⓘ for marks, its kind and voice; the kind ⓘ follows the select; spares of a category have ⓘ', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BoardEditor round={boardWith(0)} onChange={onChange} />);
    screen.getByRole('button', { name: 'Довідка: ×2 і ×3' });
    screen.getByRole('button', { name: 'Довідка: Звичайна клітинка' });
    screen.getByRole('button', { name: 'Довідка: Відповідь уголос' });
    fireEvent.change(screen.getByLabelText('Тип клітинки'), { target: { value: 'blitz' } });
    const next = onChange.mock.calls[0][0] as BoardRound;
    rerender(<BoardEditor round={next} onChange={onChange} />);
    expect(screen.getAllByRole('button', { name: 'Довідка: Бліц-клітинка' })).toHaveLength(2);
    within(screen.getByRole('region', { name: /^Запасні категорії/ })).getByRole('button', { name: 'Довідка: Запасні запитання' });
    const calls = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: ×2 і ×3' }));
    expect(onChange.mock.calls.length).toBe(calls);
  });
});

describe('BoardEditor revealing picture (10b)', () => {
  const withPicture = (): BoardRound => {
    const round = boardWith(0);
    const [first, ...rest] = round.categories;
    const [cell, ...cells] = first.cells;
    const question = { ...cell.question, imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png', reveal: 'pixels' as const };
    return { ...round, categories: [{ ...first, cells: [{ ...cell, question }, ...cells] }, ...rest] };
  };

  it('a normal phone cell with a picture offers the mode; switching it to blitz drops the mode and hides the choice', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BoardEditor round={withPicture()} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'З пікселів' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('Тип клітинки'), { target: { value: 'blitz' } });
    const next = onChange.mock.calls[0][0] as BoardRound;
    expect(next.categories[0].cells[0].kind).toBe('blitz');
    expect('reveal' in next.categories[0].cells[0].question).toBe(false);
    rerender(<BoardEditor round={next} onChange={onChange} />);
    expect(screen.queryByRole('group', { name: 'Картинка, що проявляється' })).toBeNull();
  });

  it('switching the cell to a spoken answer drops the mode too', () => {
    const onChange = vi.fn();
    render(<BoardEditor round={withPicture()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(t('boardCellMode')), { target: { value: 'voice' } });
    const next = onChange.mock.calls[0][0] as BoardRound;
    expect('reveal' in next.categories[0].cells[0].question).toBe(false);
  });
});

describe('BoardEditor clues and pin cells (10c)', () => {
  const voiceCell = (): BoardRound => {
    const round = boardWith(0);
    const [first, ...rest] = round.categories;
    const [cell, ...cells] = first.cells;
    return { ...round, categories: [{ ...first, cells: [{ ...cell, answerMode: 'voice' as const }, ...cells] }, ...rest] };
  };

  it('a pin on a voice cell switches it to a normal phone cell and shows the note', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BoardEditor round={voiceCell()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'точка' }));
    const next = onChange.mock.calls[0][0] as BoardRound;
    expect(next.categories[0].cells[0]).toMatchObject({ kind: 'normal', answerMode: 'phone', penalty: 'none' });
    expect(next.categories[0].cells[0].question.type).toBe('pin');
    rerender(<BoardEditor round={next} onChange={onChange} />);
    expect(screen.getByText(t('pinCellNote'))).toBeTruthy();
    expect(screen.queryByLabelText('Тип клітинки')).toBeNull();
    expect(screen.queryByLabelText(t('boardCellMode'))).toBeNull();
  });

  it('«Who am I?» on a voice cell stays voice, tells the host opens the clues and has no interval', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BoardEditor round={voiceCell()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    const next = onChange.mock.calls[0][0] as BoardRound;
    expect(next.categories[0].cells[0]).toMatchObject({ kind: 'normal', answerMode: 'voice' });
    rerender(<BoardEditor round={next} onChange={onChange} />);
    expect(screen.getByText(t('cluesVoiceHint'))).toBeTruthy();
    expect(screen.queryByLabelText(t('cluesInterval'))).toBeNull();
    expect(screen.getByText(t('cluesCellNote'))).toBeTruthy();
    expect(screen.queryByLabelText('Тип клітинки')).toBeNull();
    expect(screen.getByLabelText(t('boardCellMode'))).toBeTruthy();
  });

  it('«Who am I?» hides the kind select', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BoardEditor round={voiceCell()} onChange={onChange} />);
    expect(screen.getByLabelText('Тип клітинки')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    rerender(<BoardEditor round={onChange.mock.calls[0][0] as BoardRound} onChange={onChange} />);
    expect(screen.queryByLabelText('Тип клітинки')).toBeNull();
  });

  it('a voice clues cell keeps the hidden interval at the minimum', () => {
    const onChange = vi.fn();
    render(<BoardEditor round={voiceCell()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    expect((onChange.mock.calls[0][0] as BoardRound).categories[0].cells[0].question).toMatchObject({ type: 'clues', interval: 3 });
  });

  it('a pin on a blitz cell turns it into a normal phone cell', () => {
    const round = boardWith(0);
    const [first, ...rest] = round.categories;
    const [cell, ...cells] = first.cells;
    const onChange = vi.fn();
    render(<BoardEditor round={{ ...round, categories: [{ ...first, cells: [{ ...cell, kind: 'blitz' as const, penalty: 'all' as const }, ...cells] }, ...rest] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'точка' }));
    expect((onChange.mock.calls[0][0] as BoardRound).categories[0].cells[0]).toMatchObject({ kind: 'normal', answerMode: 'phone', penalty: 'none' });
  });

  it('«Who am I?» on a blitz cell turns it into a normal cell', () => {
    const round = boardWith(0);
    const [first, ...rest] = round.categories;
    const [cell, ...cells] = first.cells;
    const onChange = vi.fn();
    render(<BoardEditor round={{ ...round, categories: [{ ...first, cells: [{ ...cell, kind: 'blitz' as const, penalty: 'all' as const }, ...cells] }, ...rest] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    expect((onChange.mock.calls[0][0] as BoardRound).categories[0].cells[0]).toMatchObject({ kind: 'normal', penalty: 'none' });
  });
});
