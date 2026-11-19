// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAchievementShares } from '../api';
import { forgetAchievementShares } from '../achievement-shares';

vi.mock('../api', () => ({ getAchievementShares: vi.fn() }));
import { ACHIEVEMENTS, type Achievement, type AchievementId } from '@quiz/shared';
import { AchievementShowcase } from './AchievementShowcase';

const EARNED: AchievementId[] = ['first_game', 'first_win', 'host', 'sniper', 'games_10', 'fast_answer', 'night_owl'];
const all = (earned: AchievementId[]): Achievement[] =>
  ACHIEVEMENTS.map((id, i) => ({ id, earned: earned.includes(id), earnedAt: earned.includes(id) ? `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00.000Z` : null }));

const open = (achievements: Achievement[], pinned: AchievementId[] = []) =>
  render(
    <MemoryRouter>
      <AchievementShowcase achievements={achievements} pinned={pinned} allTo="/profile/achievements" />
    </MemoryRouter>,
  );

beforeEach(() => {
  forgetAchievementShares();
  vi.mocked(getAchievementShares).mockResolvedValue({ ok: true, data: { players: 200, holders: { first_win: 5, first_game: 100 } } });
});
afterEach(cleanup);

describe('AchievementShowcase', () => {
  it('the caption tells the share', async () => {
    open(all(EARNED), ['first_win', 'first_game']);
    const squares = await screen.findAllByRole('button');
    await waitFor(() => expect(squares[0]!.classList.contains('is-very-rare')).toBe(true));
    expect(squares[1]!.classList.contains('is-rare')).toBe(false);
    expect(squares[1]!.classList.contains('is-very-rare')).toBe(false);
    fireEvent.click(squares[0]!);
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe('Перша перемога · є в 2 % гравців · дуже рідкісне');
    fireEvent.click(squares[1]!);
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe('Перша гра · є в 50 % гравців');
  });

  it('heads with the earned count and links to all', () => {
    open(all(EARNED));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Ачівки · 7 з 102');
    expect(screen.getByRole('link', { name: /^усі/ }).getAttribute('href')).toBe('/profile/achievements');
    expect(document.querySelectorAll('.achievement-square')).toHaveLength(5);
  });

  it('shows the pinned ones in their order, and a tap captions the square', () => {
    open(all(EARNED), ['host', 'sniper']);
    const squares = [...document.querySelectorAll<HTMLButtonElement>('button.achievement-square')];
    expect(squares.map((square) => square.title)).toEqual(['За пультом', 'Снайперська точність']);
    const caption = document.querySelector('[aria-live="polite"]')!;
    expect(caption.textContent).toBe('');
    fireEvent.click(squares[0]!);
    expect(caption.textContent).toBe('За пультом');
    fireEvent.focus(squares[1]!);
    expect(caption.textContent).toBe('Снайперська точність');
  });

  it('squares are at least 44 px buttons named by the achievement', () => {
    open(all(EARNED), ['host']);
    expect(screen.getByRole('button', { name: 'За пультом' })).toBeTruthy();
  });

  it('without earned achievements shows the cloud and «Ще жодного досягнення»', () => {
    open(all([]));
    expect(screen.getByText('Ще жодного досягнення')).toBeTruthy();
    expect(document.querySelector('.cloud-motif')).toBeTruthy();
    expect(document.querySelectorAll('.achievement-square')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Ачівки · 0 з 102');
  });
});
