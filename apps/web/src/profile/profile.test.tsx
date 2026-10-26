// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProfileCard } from '@quiz/shared';
import { AchievementList } from './AchievementList';
import { Avatar } from './Avatar';
import { StatsView } from './StatsView';

afterEach(cleanup);

const card = (over: Partial<ProfileCard>): ProfileCard => ({ id: 'u1', nickname: 'зірка', avatar: null, ...over });

describe('profile parts', () => {
  it('Avatar shows the picture or the first letter', () => {
    const { unmount } = render(<Avatar profile={card({ avatar: '/uploads/0123456789abcdef.png' })} size="large" />);
    const img = screen.getByRole('img', { name: 'Аватар зірка' });
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('/uploads/0123456789abcdef.png');
    unmount();

    const { unmount: again } = render(<Avatar profile={card({})} size="small" />);
    const letter = screen.getByRole('img', { name: 'Аватар зірка' });
    expect(letter.textContent).toBe('З');
    expect(letter.className).toMatch(/avatar-tone-[0-3]/);
    again();

    render(<Avatar profile={card({ nickname: '🙂 Оля' })} size="small" />);
    expect(screen.getByRole('img').textContent).toBe('🙂');
  });

  it('StatsView shows five numbers with the right word forms', () => {
    const { container } = render(<StatsView stats={{ games: 1, wins: 2, accuracy: null, quizzes: 5, hosted: 1, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null }} />);
    const stats = [...container.querySelectorAll('dl.stats:not(.podium-stats) .stat')].map((el) => [el.querySelector('dd')?.textContent, el.querySelector('dt')?.textContent]);
    expect(stats).toEqual([
      ['1', 'гра'],
      ['2', 'перемоги'],
      ['–', 'правильних відповідей'],
      ['5', 'вікторин'],
      ['1', 'проведена гра'],
    ]);
  });

  it('StatsView shows the podium numbers under the five', () => {
    const base = { games: 5, wins: 3, accuracy: 70, quizzes: 0, hosted: 0 };
    const cells = (container: HTMLElement) =>
      [...container.querySelectorAll('.podium-stats .stat')].map((el) => [el.querySelector('dd')?.textContent, el.querySelector('dt')?.textContent]);
    const { container, unmount } = render(
      <StatsView stats={{ ...base, podium: { first: 3, second: 2, third: 1 }, top3: 60, bestScore: 4200, avgPlace: 2.4 }} />,
    );
    expect(container.querySelector('.podium-stats')?.getAttribute('aria-label')).toBe('П’єдестал');
    expect(cells(container)).toEqual([
      ['3', '1-е місце'],
      ['2', '2-е місце'],
      ['1', '3-є місце'],
      ['60%', 'у трійці'],
      ['4200', 'найкращий рахунок'],
      ['2,4', 'середнє місце'],
    ]);
    unmount();

    const empty = render(<StatsView stats={{ ...base, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null }} />);
    expect(cells(empty.container).map(([value]) => value)).toEqual(['0', '0', '0', '–', '–', '–']);
  });

  it('AchievementList shows earned and locked achievements', () => {
    const { container } = render(
      <AchievementList achievements={[{ id: 'first_game', earned: true }, { id: 'wins_10', earned: false }]} />,
    );
    const earned = screen.getByText('Перша гра').closest('li');
    expect(earned?.textContent).toContain('🎮');
    expect(earned?.getAttribute('title')).toBe('Зіграти першу гру з акаунта');
    const locked = screen.getByLabelText('10 перемог (ще не отримано)');
    expect(locked.className).toContain('locked');
    expect(locked.textContent).toContain('🔒');
    expect(container.querySelectorAll('ul.achievements > li')).toHaveLength(2);
  });
});
