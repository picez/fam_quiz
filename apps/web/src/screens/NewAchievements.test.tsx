// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NewAchievements } from './NewAchievements';

afterEach(cleanup);

describe('NewAchievements (12j)', () => {
  it('two: «Нові досягнення!», the anti one framed with «Ну… теж досягнення», a link to all', () => {
    const { container } = render(<NewAchievements mine={{ account: true, ids: ['sniper', 'in_debt'] }} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Нові досягнення!');
    const cards = container.querySelectorAll('li.new-achievement');
    expect(cards).toHaveLength(2);
    expect(cards[0].classList.contains('is-anti')).toBe(false);
    expect(cards[0].querySelector('h3')?.textContent).toBe('Снайперська точність');
    expect(cards[1].classList.contains('is-anti')).toBe(true);
    expect(cards[1].querySelector('h3')?.textContent).toBe('У мінусі');
    expect(cards[1].textContent).toContain('Борг — теж досягнення. Банк уже дзвонить.');
    expect(cards[1].querySelector('.new-achievement-anti')?.textContent).toBe('Ну… теж досягнення');
    expect(cards[0].querySelector('.new-achievement-anti')).toBeNull();
    expect(screen.getByRole('link', { name: 'Усі досягнення' }).getAttribute('href')).toBe('/profile/achievements');
  });

  it('one: «Нове досягнення!»', () => {
    render(<NewAchievements mine={{ account: true, ids: ['fast_answer'] }} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Нове досягнення!');
  });

  it('nothing new or no data — nothing at all', () => {
    expect(render(<NewAchievements mine={{ account: true, ids: [] }} />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<NewAchievements mine={undefined} />).container.innerHTML).toBe('');
  });

  it('a guest is asked to sign in and comes back to the achievements page', () => {
    const { container } = render(<NewAchievements mine={{ account: false, ids: [] }} />);
    expect(container.querySelector('.new-achievements-guest')?.textContent).toContain('Увійди, щоб збирати досягнення');
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe(`/login?next=${encodeURIComponent('/profile/achievements')}`);
    expect(container.querySelector('li')).toBeNull();
  });
});
