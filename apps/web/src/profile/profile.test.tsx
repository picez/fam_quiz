// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, type Achievement, type ProfileCard } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { AchievementStrip } from './AchievementStrip';
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

  describe('AchievementStrip', () => {
    const strip = (achievements: Achievement[]) =>
      render(
        <MemoryRouter>
          <AchievementStrip achievements={achievements} to="/achievements" />
        </MemoryRouter>,
      );
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}T12:00:00.000Z`;

    it('shows the eight newest earned badges and a link with the rest', () => {
      const ids = ACHIEVEMENTS.slice(0, 14);
      const list: Achievement[] = ids.map((id, i) => ({
        id,
        earned: i < 12,
        earnedAt: i < 10 ? day(i + 1) : null,
      }));
      const { container } = strip(list);
      const items = [...container.querySelectorAll('ul.achievements.achievement-strip > li')];
      expect(items).toHaveLength(8);
      const names = items.map((li) => li.getAttribute('title'));
      expect(names).toEqual(ids.slice(2, 10).reverse().map((id) => t(`achievement_${id}` as TextKey)));
      const more = screen.getByRole('link', { name: 'ще 4 →' });
      expect(more.getAttribute('href')).toBe('/achievements');
    });

    it('puts the newest first and skips the locked ones', () => {
      const { container } = strip([
        { id: 'first_game', earned: true, earnedAt: day(1) },
        { id: 'fast_answer', earned: true, earnedAt: day(5) },
        { id: 'wins_10', earned: false, earnedAt: null },
      ]);
      const items = [...container.querySelectorAll('.achievement-strip > li')];
      expect(items.map((li) => li.getAttribute('title'))).toEqual(['Швидкі пальці', 'Перша гра']);
      expect(items[0]?.textContent).toContain('🏎️');
      expect(items[0]?.querySelector('.sr-only')?.textContent).toBe('Швидкі пальці');
      expect(items[0]?.querySelector('[aria-hidden="true"]')?.textContent).toBe('🏎️');
      expect(container.textContent).not.toContain('10 перемог');
      expect(container.textContent).not.toContain('🔒');
    });

    it('with eight or fewer earned shows «Усі досягнення →»', () => {
      strip([
        { id: 'first_game', earned: true, earnedAt: null },
        { id: 'host', earned: true, earnedAt: null },
        { id: 'first_win', earned: true, earnedAt: null },
      ]);
      expect(document.querySelectorAll('.achievement-strip > li')).toHaveLength(3);
      expect(screen.getByRole('link', { name: 'Усі досягнення →' }).getAttribute('href')).toBe('/achievements');
    });

    it('with none earned says so and still links to the page', () => {
      const { container } = strip([{ id: 'first_game', earned: false, earnedAt: null }]);
      expect(screen.getByText('Ще жодного досягнення').className).toContain('meta');
      expect(container.querySelectorAll('.achievement-strip > li')).toHaveLength(0);
      expect(screen.getByRole('link', { name: 'Усі досягнення →' })).toBeTruthy();
    });
  });
});
