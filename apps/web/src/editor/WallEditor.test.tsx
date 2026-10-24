// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Question } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { WallEditor } from './WallEditor';

type Wall = Extract<Question, { type: 'wall' }>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const wall = (): Wall => newQuestion('wall') as Wall;
const withText = (question: Wall): Wall => ({
  ...question,
  groups: question.groups.map((group, g) => ({ ...group, name: `Зв'язок ${g + 1}`, tiles: group.tiles.map((tile, k) => ({ ...tile, text: `П${g + 1}${k + 1}` })) })),
});
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as Wall;

describe('WallEditor', () => {
  it('shows four group cards of four tiles; the size 4×4 is pressed', () => {
    render(<WallEditor question={wall()} onChange={vi.fn()} />);
    expect(screen.getAllByRole('group', { name: /^Група \d$/ })).toHaveLength(4);
    expect(screen.getAllByLabelText(/^Плитка \d$/)).toHaveLength(16);
    expect(screen.getByRole('button', { name: '4×4' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '3×3' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(t('wallGroupNameHint'))).toBeTruthy();
    expect(screen.getByText(t('wallOrderHint'))).toBeTruthy();
  });

  it('3×3 cuts the last group and the last tile of each group; an empty wall asks nothing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    render(<WallEditor question={wall()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '3×3' }));
    expect(confirm).not.toHaveBeenCalled();
    const next = last(onChange);
    expect(next.groups.map((group) => group.tiles.length)).toEqual([3, 3, 3]);
  });

  it('3×3 with text in the part that goes away asks first; «no» changes nothing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = vi.fn();
    render(<WallEditor question={withText(wall())} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '3×3' }));
    expect(confirm).toHaveBeenCalledWith(t('wallShrinkConfirm'));
    expect(onChange).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '3×3' }));
    const next = last(onChange);
    expect(next.groups).toHaveLength(3);
    expect(next.groups[0].tiles.map((tile) => tile.text)).toEqual(['П11', 'П12', 'П13']);
  });

  it('4×4 from 3×3 adds an empty group and an empty tile to every group, keeping the text', () => {
    const three = withText({ ...wall(), groups: wall().groups.slice(0, 3).map((group) => ({ ...group, tiles: group.tiles.slice(0, 3) })) });
    const onChange = vi.fn();
    render(<WallEditor question={three} onChange={onChange} />);
    expect(screen.getAllByRole('group', { name: /^Група \d$/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '4×4' }));
    const next = last(onChange);
    expect(next.groups).toHaveLength(4);
    expect(next.groups.map((group) => group.tiles.length)).toEqual([4, 4, 4, 4]);
    expect(next.groups[0].tiles.map((tile) => tile.text)).toEqual(['П11', 'П12', 'П13', '']);
    expect(next.groups[3]).toMatchObject({ name: '', tiles: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] });
    expect(new Set(next.groups.flatMap((group) => [group.id, ...group.tiles.map((tile) => tile.id)])).size).toBe(20);
  });

  it('a group name and a tile change only that group and tile', () => {
    const onChange = vi.fn();
    render(<WallEditor question={wall()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Назва групи 1'), { target: { value: 'Річки' } });
    expect(last(onChange).groups[0].name).toBe('Річки');
    const second = screen.getByRole('group', { name: 'Група 2' });
    fireEvent.change(within(second).getByLabelText('Плитка 2'), { target: { value: 'Дніпро' } });
    const next = last(onChange);
    expect(next.groups[1].tiles[1].text).toBe('Дніпро');
    expect(next.groups[0].tiles[1].text).toBe('');
  });

  it('the mistake limit is a number', () => {
    const onChange = vi.fn();
    render(<WallEditor question={wall()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Помилок до замикання'), { target: { value: '5' } });
    expect(last(onChange).mistakes).toBe(5);
  });

  it('tells what a group is worth', () => {
    const { rerender } = render(<WallEditor question={wall()} onChange={vi.fn()} />);
    expect(screen.getByText('Кожна група — 250 балів. Остання складається сама, тож за всю стіну — 750.')).toBeTruthy();
    rerender(<WallEditor question={{ ...wall(), points: 900, groups: wall().groups.slice(0, 3).map((g) => ({ ...g, tiles: g.tiles.slice(0, 3) })) }} onChange={vi.fn()} />);
    expect(screen.getByText('Кожна група — 300 балів. Остання складається сама, тож за всю стіну — 600.')).toBeTruthy();
  });
});
