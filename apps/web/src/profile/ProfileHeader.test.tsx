// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { levelProgress, type ProfileStats } from '@quiz/shared';
import { HeadlineStats, ProfileHeader } from './ProfileHeader';

afterEach(cleanup);

const stats: ProfileStats = {
  games: 48,
  wins: 17,
  accuracy: 72,
  quizzes: 4,
  hosted: 16,
  podium: { first: 0, second: 0, third: 0 },
  top3: null,
  bestScore: null,
  avgPlace: null,
};

const header = (props: Partial<Parameters<typeof ProfileHeader>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ProfileHeader profile={{ id: 'u1', nickname: 'Олена', avatar: null }} level={7} badge={null} title={null} stats={stats} {...props} />
    </MemoryRouter>,
  );

describe('ProfileHeader', () => {
  it('shows the nickname in h1 with the level pill', () => {
    const { container } = header();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Олена');
    expect(container.querySelector('.profile-head h1 .nick-level')?.textContent).toBe('Рів. 7');
  });

  it('shows the wins pill in the right plural form', () => {
    header({ stats: { ...stats, wins: 3 } });
    expect(screen.getByText('🏆 3 перемоги')).toBeTruthy();
    cleanup();
    header({ stats: { ...stats, wins: 5 } });
    expect(screen.getByText('🏆 5 перемог')).toBeTruthy();
  });

  it('shows the four headline numbers', () => {
    const { container } = header();
    expect([...container.querySelectorAll('.headline-stats dd')].map((dd) => dd.textContent)).toEqual(['48', '17', '72%', '16']);
    expect([...container.querySelectorAll('.headline-stats dt')].map((dt) => dt.textContent)).toEqual(['ігор', 'перемог', 'правильних відповідей', 'проведених ігор']);
  });

  it('shows a dash without accuracy', () => {
    render(<HeadlineStats stats={{ ...stats, accuracy: null }} />);
    expect(document.querySelectorAll('.headline-stats dd')[2]?.textContent).toBe('–');
  });

  it('links to editing only with editTo', () => {
    header();
    expect(screen.queryByRole('link', { name: /Змінити нікнейм \/ аватар/ })).toBeNull();
    cleanup();
    header({ editTo: '/profile/settings?edit=1' });
    expect(screen.getByRole('link', { name: /Змінити нікнейм \/ аватар/ }).getAttribute('href')).toBe('/profile/settings?edit=1');
  });

  it('shows the level bar only with progress, the title and the actions', () => {
    header();
    expect(screen.queryByRole('heading', { name: 'Рівень 1' })).toBeNull();
    cleanup();
    header({ progress: levelProgress(0), title: 'Король', children: <button type="button">Додати в друзі</button> });
    expect(screen.getByRole('heading', { name: 'Рівень 1' })).toBeTruthy();
    expect(document.querySelector('h1 .nick-title')?.textContent).toBe('Король');
    expect(screen.getByRole('button', { name: 'Додати в друзі' })).toBeTruthy();
  });

  it('puts the avatar in a tomoe ring under the moon', () => {
    const { container } = header();
    expect(container.querySelector('.motif-hero .moon')).toBeTruthy();
    expect(container.querySelector('.profile-head .tomoe-ring .avatar')).toBeTruthy();
  });
});
