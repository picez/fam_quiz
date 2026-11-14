// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(cleanup);

describe('AchievementShowcase', () => {
  it('heads with the earned count and links to all', () => {
    open(all(EARNED));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Ачівки · 7 з 70');
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
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Ачівки · 0 з 70');
  });
});
