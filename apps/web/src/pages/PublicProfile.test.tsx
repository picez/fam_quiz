// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shelfColumns, type PublicProfile as PublicProfileData } from '@quiz/shared';
import { t } from '../i18n';
import { follow, getProfile, getVersus, me, unfollow } from '../api';
import { PublicProfile } from './PublicProfile';

vi.mock('../api', () => ({ me: vi.fn(), getProfile: vi.fn(), follow: vi.fn(), unfollow: vi.fn(), getVersus: vi.fn() }));

const profile = (over: Partial<PublicProfileData> = {}): PublicProfileData => ({
  id: 'u2',
  nickname: 'Тарас',
  avatar: null,
  stats: { games: 3, wins: 1, accuracy: 70, quizzes: 2, hosted: 0, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null },
  achievements: [{ id: 'first_game', earned: true, earnedAt: null }],
  following: false,
  showcase: { title: null, awards: [], pins: { prizes: [], achievements: [] } },
  level: { level: 1, looks: { color: null, frame: null, badge: null, photo: null, font: null, effect: null } },
  likes: { author: 0, host: 0, player: 0 },
  ...over,
});

const award = (id: string, place: 1 | 2 | 3 = 1) => ({
  id,
  place,
  quizTitle: `Квіз ${id}`,
  nickname: 'Тарас',
  awardedAt: '2026-10-30T10:00:00.000Z',
  content: { trophy: null, engraving: null, real: { text: `Приз ${id}`, photoUrl: null }, title: null, diploma: false },
});
const withAwards = (n: number, pinned: string[] = []) =>
  profile({ showcase: { title: null, awards: Array.from({ length: n }, (_, i) => award(`a${i + 1}`)), pins: { prizes: pinned, achievements: [] } } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile() });
  vi.mocked(follow).mockResolvedValue({ ok: true });
  vi.mocked(unfollow).mockResolvedValue({ ok: true });
  vi.mocked(getVersus).mockResolvedValue({ ok: true, data: { together: 0, myAhead: 0, theirAhead: 0, myAccuracy: null, theirAccuracy: null, recent: [] } });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/profile/u2']}>
      <Routes>
        <Route path="/profile/:id" element={<PublicProfile />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PublicProfile', () => {
  it('shows the placeholder for a profile without a nickname', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ nickname: null }) });
    open();
    expect(await screen.findByRole('heading', { name: /Гравець/ })).toBeTruthy();
  });

  it('shows the same header and four numbers as the own profile, and no tiles', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ stats: { games: 12, wins: 4, accuracy: 70, quizzes: 2, hosted: 3, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null } }) });
    const { container } = open();
    expect(await screen.findByText('Тарас')).toBeTruthy();
    const values = [...container.querySelectorAll('.headline-stats dd')].map((dd) => dd.textContent);
    expect(values).toEqual(['12', '4', '70%', '3']);
    expect(container.querySelector('.profile-tiles')).toBeNull();
    expect(screen.queryByText('email приховано')).toBeNull();
  });

  it('the shelf shows the prizes the owner pinned, in shelf order', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: withAwards(5, ['a3', 'a1', 'a2']) });
    const { container } = open();
    await screen.findByText('Тарас');
    const expected = shelfColumns(['a3', 'a1', 'a2']).map((id) => `Квіз ${id}`);
    const shown = [...container.querySelectorAll('.shelf-stand > li')].map((li) => li.textContent ?? '');
    expect(shown).toHaveLength(3);
    expected.forEach((text, i) => expect(shown[i]).toContain(text));
  });

  it('«Усі нагороди (5)» opens all five cards and a second tap hides them', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: withAwards(5) });
    const { container } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Усі нагороди (5)' }));
    expect(container.querySelectorAll('.award-card')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Сховати нагороди' }));
    expect(container.querySelectorAll('.award-card')).toHaveLength(0);
  });

  it('with three awards or fewer there is no «all» button', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: withAwards(3) });
    open();
    await screen.findByText('Тарас');
    expect(screen.queryByRole('button', { name: /Усі нагороди/ })).toBeNull();
  });

  it('shows the achievements the owner pinned and links to all of them', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      ok: true,
      data: profile({
        achievements: [
          { id: 'first_game', earned: true, earnedAt: null },
          { id: 'host', earned: true, earnedAt: null },
        ],
        showcase: { title: null, awards: [], pins: { prizes: [], achievements: ['host'] } },
      }),
    });
    const { container } = open();
    await screen.findByText('Тарас');
    expect(container.querySelectorAll('.achievement-square')).toHaveLength(1);
    expect(container.querySelector('.achievement-square')?.getAttribute('title')).toBe(t('achievement_host'));
    expect(screen.getByRole('link', { name: /усі/ }).getAttribute('href')).toBe('/profile/u2/achievements');
  });

  it('a profile without awards and achievements shows two clouds and no errors', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ following: null, achievements: [{ id: 'first_game', earned: false, earnedAt: null }] }) });
    const { container } = open();
    await screen.findByText('Тарас');
    expect(container.querySelectorAll('.showcase-empty')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the title badge next to the nickname and the shelf', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      ok: true,
      data: profile({
        showcase: {
          title: { text: 'Король', until: '2026-11-06T10:00:00.000Z' },
          pins: { prizes: [], achievements: [] },
          awards: [{ id: 'a1', place: 1, quizTitle: 'Столиці', nickname: 'Тарас', awardedAt: '2026-10-30T10:00:00.000Z', content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false } }],
        },
      }),
    });
    open();
    expect(await screen.findByRole('heading', { name: /Вітрина кубків/ })).toBeTruthy();
    expect(document.querySelector('h1 .nick-title')?.textContent).toBe('Король');
  });

  it('shows the likes section after the shelf and achievements and before the stats', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ likes: { author: 5, host: 2, player: 1 } }) });
    const { container } = open();
    expect(await screen.findByRole('heading', { name: 'Вподобання' })).toBeTruthy();
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent ?? '');
    const at = (text: string) => headings.findIndex((h) => h.includes(text));
    expect(at('Вітрина кубків')).toBeLessThan(at('Ачівки'));
    expect(at('Ачівки')).toBeLessThan(at('Вподобання'));
    expect(at('Вподобання')).toBeLessThan(at('Статистика'));
    expect(container.querySelector('.likes-card')?.textContent).toContain('5');
  });

  it('shows the level and the badge of another player, without the bar', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ level: { level: 5, looks: { color: null, frame: null, badge: '⭐', photo: null, font: null, effect: null } } }) });
    const { container } = open();
    expect(await screen.findByText('Рів. 5')).toBeTruthy();
    expect(container.querySelector('.profile-head .profile-badge')?.textContent).toBe('⭐');
    expect(container.querySelector('progress')).toBeNull();
  });

  it('the achievements link encodes the profile id', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ id: 'a/b c' }) });
    open();
    expect(await screen.findByText('Тарас')).toBeTruthy();
    expect(screen.getByRole('link', { name: /усі/ }).getAttribute('href')).toBe('/profile/a%2Fb%20c/achievements');
  });

  it('shows the podium numbers of a public profile', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      ok: true,
      data: profile({ stats: { games: 3, wins: 1, accuracy: 70, quizzes: 2, hosted: 0, podium: { first: 1, second: 2, third: 0 }, top3: 100, bestScore: 900, avgPlace: 1.7 } }),
    });
    open();
    expect(await screen.findByText('Тарас')).toBeTruthy();
    expect(screen.getByText('2-е місце').closest('.stat')?.querySelector('dd')?.textContent).toBe('2');
    expect(screen.getByText('середнє місце').closest('.stat')?.querySelector('dd')?.textContent).toBe('1,7');
  });

  it('adds to friends and removes again', async () => {
    open();
    expect(await screen.findByText('Тарас')).toBeTruthy();
    expect(screen.getByText('Статистика')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Додати в друзі' }));
    expect(await screen.findByText('У друзях')).toBeTruthy();
    expect(follow).toHaveBeenCalledWith('u2');
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати з друзів' }));
    expect(await screen.findByRole('button', { name: 'Додати в друзі' })).toBeTruthy();
    expect(unfollow).toHaveBeenCalledWith('u2');
  });

  it('a second tap while the request runs does nothing and the button is disabled', async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    vi.mocked(follow).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    const button = (await screen.findByRole('button', { name: 'Додати в друзі' })) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(follow).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    expect(await screen.findByText('У друзях')).toBeTruthy();
    expect(unfollow).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Прибрати з друзів' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a visitor is asked to sign in to follow', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ following: null }) });
    open();
    const link = await screen.findByRole('link', { name: 'Увійдіть, щоб додати в друзі' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fprofile%2Fu2');
    expect(screen.queryByRole('button', { name: 'Додати в друзі' })).toBeNull();
  });

  it('the owner sees a link to their own profile instead of the button', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u2', name: 'Тарас', email: 't@example.com', admin: false });
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ following: null }) });
    open();
    const link = await screen.findByRole('link', { name: 'Це ваш профіль' });
    expect(link.getAttribute('href')).toBe('/profile');
  });

  it('shows how the viewer compares with this player', async () => {
    vi.mocked(getVersus).mockResolvedValue({
      ok: true,
      data: {
        together: 3,
        myAhead: 2,
        theirAhead: 1,
        myAccuracy: 80,
        theirAccuracy: 60,
        recent: [{ gameId: 'g1', title: 'Кіно', startedAt: '2026-10-20T18:00:00.000Z', myRank: 1, theirRank: 2 }],
      },
    });
    open();
    expect(await screen.findByText('Ви і Тарас')).toBeTruthy();
    const block = within(screen.getByText('Ви і Тарас').closest('section')!);
    for (const [value, label] of [['3', 'гри разом'], ['2', 'гри, де ви вище'], ['1', 'гра, де Тарас вище'], ['80%', 'правильних відповідей у вас'], ['60%', 'правильних відповідей — Тарас']]) {
      expect(block.getByText(label).previousElementSibling?.textContent).toBe(value);
    }
    expect(block.getByText(/«Кіно»: ви — 1 місце, Тарас — 2 місце/)).toBeTruthy();
    expect(getVersus).toHaveBeenCalledWith('u2');
  });

  it('counts with no or many games use the plural', async () => {
    vi.mocked(getVersus).mockResolvedValue({
      ok: true,
      data: { together: 5, myAhead: 0, theirAhead: 5, myAccuracy: 40, theirAccuracy: 90, recent: [] },
    });
    open();
    const block = within((await screen.findByText('Ви і Тарас')).closest('section')!);
    for (const [value, label] of [['5', 'ігор разом'], ['0', 'ігор, де ви вище'], ['5', 'ігор, де Тарас вище']]) {
      expect(block.getByText(label).previousElementSibling?.textContent).toBe(value);
    }
  });

  it('a viewer who never played with them sees a short note', async () => {
    open();
    expect(await screen.findByText('Ви ще не грали разом.')).toBeTruthy();
    expect(screen.queryByText('Останні спільні ігри')).toBeNull();
  });

  it('no comparison for a visitor or on your own profile', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    await screen.findByText('Статистика');
    expect(screen.queryByText('Ви і Тарас')).toBeNull();
    expect(getVersus).not.toHaveBeenCalled();
    cleanup();
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u2', name: 'Тарас', email: 't@example.com', admin: false });
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ following: null }) });
    open();
    await screen.findByText('Статистика');
    expect(screen.queryByText('Ви і Тарас')).toBeNull();
    expect(getVersus).not.toHaveBeenCalled();
  });

  it('a failed comparison hides the block without breaking the profile', async () => {
    vi.mocked(getVersus).mockResolvedValue({ ok: false, error: 'network' });
    open();
    expect(await screen.findByText('Статистика')).toBeTruthy();
    expect(screen.queryByText('Ви і Тарас')).toBeNull();
    expect(document.querySelectorAll('.profile-section')).toHaveLength(4);
  });

  it('an unknown profile says so', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: false, error: 'not_found' });
    open();
    expect(await screen.findByText('Такого профілю немає.')).toBeTruthy();
  });
});
