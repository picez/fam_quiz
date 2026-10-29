// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_INFO, type AchievementCard, type AchievementsPage } from '@quiz/shared';
import { getAchievements, getMyAchievements, me } from '../api';
import { formatDay } from '../format';
import { Achievements } from './Achievements';

vi.mock('../api', () => ({ me: vi.fn(), getMyAchievements: vi.fn(), getAchievements: vi.fn() }));

const EARNED: Record<string, string | null> = { fast_answer: '2026-10-29T10:00:00.000Z', first_game: null };

const card = (id: AchievementCard['id'], own: boolean): AchievementCard => {
  const goal = ACHIEVEMENT_INFO[id].goal;
  const earned = id in EARNED;
  return {
    id,
    earned,
    earnedAt: earned ? (EARNED[id] ?? null) : null,
    progress: own && goal !== null ? { current: id === 'games_10' ? 1 : 0, goal } : null,
  };
};

const mine: AchievementsPage = {
  profile: { id: 'u1', nickname: 'Олена', avatar: null },
  own: true,
  earned: 2,
  total: 48,
  items: ACHIEVEMENTS.map((id) => card(id, true)),
};

const theirs: AchievementsPage = {
  profile: { id: 'u2', nickname: 'Оля', avatar: null },
  own: false,
  earned: 2,
  total: 48,
  items: ACHIEVEMENTS.filter((id) => id in EARNED).map((id) => card(id, false)),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
  vi.mocked(getMyAchievements).mockResolvedValue({ ok: true, data: mine });
  vi.mocked(getAchievements).mockResolvedValue({ ok: true, data: theirs });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/profile/:id/achievements" element={<Achievements />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const cardOf = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement;

describe('Achievements, own page', () => {
  it('shows the count, the groups in order without the empty anti group', async () => {
    const { container } = open('/achievements');
    expect(await screen.findByText('Отримано 2 з 48')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Ачівки' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Перші кроки',
      'Влучність',
      'Швидкість',
      'Формати',
      'Бафи й дебафи',
      'Компанія',
      'Ведення й авторство',
    ]);
    expect(screen.queryByText('Антиачівки')).toBeNull();
    expect(container.querySelectorAll('.achievement-card')).toHaveLength(48);
    expect(getMyAchievements).toHaveBeenCalled();
  });

  it('an earned card has its joke, the condition and the date', async () => {
    open('/achievements');
    await screen.findByText('Отримано 2 з 48');
    const fast = cardOf('Швидкі пальці');
    expect(fast.classList.contains('is-locked')).toBe(false);
    expect(within(fast).getByText('Відповідь є, а запитання ще не дочитане. Сміливо!')).toBeTruthy();
    expect(within(fast).getByText('Правильна відповідь швидше ніж за 2 с')).toBeTruthy();
    expect(within(fast).getByText(`Отримано ${formatDay('2026-10-29T10:00:00.000Z')}`)).toBeTruthy();
    expect(within(fast).getByText('Отримано 29 жовтня 2026')).toBeTruthy();
    expect(within(cardOf('Перша гра')).getByText('Отримано давно')).toBeTruthy();
  });

  it('a locked counted card is grey with its progress, a locked one-off has none', async () => {
    open('/achievements');
    await screen.findByText('Отримано 2 з 48');
    const games = cardOf('10 ігор');
    expect(games.classList.contains('is-locked')).toBe(true);
    expect(games.getAttribute('aria-label')).toBe('10 ігор: ще не отримано');
    const bar = games.querySelector('progress');
    expect(bar?.getAttribute('value')).toBe('1');
    expect(bar?.getAttribute('max')).toBe('10');
    expect(within(games).getByText('1 / 10')).toBeTruthy();
    expect(within(games).queryByText(/Отримано/)).toBeNull();
    const sniper = cardOf('Снайперська точність');
    expect(sniper.classList.contains('is-locked')).toBe(true);
    expect(sniper.querySelector('progress')).toBeNull();
  });

  it('a visitor goes to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/achievements');
    expect(await screen.findByText('на /login?next=%2Fachievements')).toBeTruthy();
  });

  it('an ended session goes to sign in too', async () => {
    vi.mocked(getMyAchievements).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/achievements');
    expect(await screen.findByText('на /login?next=%2Fachievements')).toBeTruthy();
  });
});

describe('Achievements, another player', () => {
  it('shows the name linked to the profile and only earned cards without progress', async () => {
    const { container } = open('/profile/u2/achievements');
    const title = await screen.findByRole('heading', { level: 1, name: 'Ачівки: Оля' });
    expect(within(title).getByRole('link', { name: 'Оля' }).getAttribute('href')).toBe('/profile/u2');
    expect(getAchievements).toHaveBeenCalledWith('u2');
    expect(container.querySelectorAll('.achievement-card')).toHaveLength(2);
    expect(container.querySelectorAll('.is-locked')).toHaveLength(0);
    expect(container.querySelector('progress')).toBeNull();
  });

  it('opens for a visitor without an account', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/profile/u2/achievements');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ачівки: Оля' })).toBeTruthy();
  });

  it('says so when nothing is earned yet', async () => {
    vi.mocked(getAchievements).mockResolvedValue({ ok: true, data: { ...theirs, earned: 0, items: [] } });
    open('/profile/u2/achievements');
    expect(await screen.findByText('Ще жодної ачівки. Усе попереду!')).toBeTruthy();
  });

  it('an unknown profile is not found', async () => {
    vi.mocked(getAchievements).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/profile/nobody/achievements');
    expect(await screen.findByText('Такого профілю немає.')).toBeTruthy();
  });
});
