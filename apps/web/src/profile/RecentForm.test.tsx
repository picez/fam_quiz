// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FormGame, RecentForm as Form } from '@quiz/shared';
import { RecentForm } from './RecentForm';

const game = (place: number, over: Partial<FormGame> = {}): FormGame => ({
  gameId: `g${place}`,
  title: 'Назва',
  startedAt: '2026-11-12T12:00:00.000Z',
  place,
  medal: place <= 3 ? (place as 1 | 2 | 3) : null,
  team: null,
  ...over,
});

afterEach(cleanup);

describe('RecentForm', () => {
  it('draws medals and numbers as chips in a list', () => {
    render(<RecentForm form={{ games: [game(1), game(3), game(5)], streak: null }} />);
    expect(screen.getByRole('heading', { name: 'Остання форма' })).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const chips = screen.getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['🥇', '🥉', '5']);
    expect(chips[2]!.getAttribute('aria-label')).toBe('5-е місце, Назва, 12.11.2026');
    expect(chips[2]!.getAttribute('title')).toBe('Назва · 12.11.2026');
  });

  it('a tap writes the game into the live caption; a team game names the team', () => {
    render(<RecentForm form={{ games: [game(1), game(3, { team: 'Сови' })], streak: null }} />);
    const caption = document.querySelector('[aria-live="polite"]')!;
    expect(caption.textContent).toBe('');
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(caption.textContent).toBe('Назва · 12.11.2026');
    fireEvent.click(screen.getAllByRole('button')[1]!);
    expect(caption.textContent).toBe('Назва · команда «Сови» · 12.11.2026');
    expect(screen.getAllByRole('button')[1]!.getAttribute('aria-label')).toBe('3-е місце, Назва, Сови, 12.11.2026');
  });

  it('the public form has no titles: only the date', () => {
    render(<RecentForm form={{ games: [{ startedAt: '2026-11-12T12:00:00.000Z', place: 2, medal: 2 }], streak: null }} />);
    const chip = screen.getByRole('button');
    expect(chip.getAttribute('aria-label')).toBe('2-е місце, 12.11.2026');
    fireEvent.click(chip);
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe('12.11.2026');
  });

  it('names the streak', () => {
    const wins: Form = { games: [game(1)], streak: { kind: 'wins', count: 3 } };
    const { unmount } = render(<RecentForm form={wins} />);
    expect(screen.getByText('3 перемоги поспіль')).toBeTruthy();
    unmount();
    render(<RecentForm form={{ games: [game(2)], streak: { kind: 'top3', count: 5 } }} />);
    expect(screen.getByText('5 ігор у трійці поспіль')).toBeTruthy();
  });

  it('draws nothing without games or without the form', () => {
    const { container, rerender } = render(<RecentForm form={undefined} />);
    expect(container.textContent).toBe('');
    rerender(<RecentForm form={{ games: [], streak: null }} />);
    expect(container.textContent).toBe('');
  });
});
