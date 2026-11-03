// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, levelProgress, type AchievementsPage, type OwnProfile } from '@quiz/shared';
import { getAchievements, getMyAchievements, getMyFriends, getMyProfile, me, myPrizes, saveMyProfile, signOut } from '../../api';
import { AppRoutes } from '../../AppRoutes';
import { formatDate } from '../../format';
import { disablePush } from '../../push/push-client';

vi.mock('../../push/push-client', () => ({
  browserEnv: vi.fn(() => ({})),
  pushSupport: vi.fn(() => 'unsupported'),
  currentSubscription: vi.fn(async () => null),
  sameKey: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(async () => undefined),
}));

vi.mock('../../api', () => ({
  me: vi.fn(),
  getMyProfile: vi.fn(),
  saveMyProfile: vi.fn(),
  findProfile: vi.fn(),
  searchProfiles: vi.fn(async () => ({ ok: true, data: [] })),
  follow: vi.fn(),
  uploadImage: vi.fn(),
  signOut: vi.fn(),
  getPushKey: vi.fn(async () => ({ ok: true, publicKey: null })),
  getMyInvites: vi.fn(async () => ({ ok: true, data: [] })),
  getFeedBadge: vi.fn(async () => ({ ok: true, events: 0, requests: 0, decisions: 0 })),
  dismissInvite: vi.fn(),
  saveLooks: vi.fn(),
  saveMyLocale: vi.fn(async () => ({ ok: true })),
  myPrizes: vi.fn(),
  createPrize: vi.fn(),
  updatePrize: vi.fn(),
  deletePrize: vi.fn(),
  getMyFriends: vi.fn(),
  getMyAchievements: vi.fn(),
  getAchievements: vi.fn(),
  getShowcasePins: vi.fn(async () => ({ ok: true, data: { prizes: [], achievements: [] } })),
  pinToShowcase: vi.fn(),
  unpinFromShowcase: vi.fn(),
}));

// Вхід і головна тут — лише адреси, куди ведуть підсторінки.
vi.mock('../Login', () => ({ Login: () => <p>Login</p> }));
vi.mock('../Home', () => ({ Home: () => <p>Home</p> }));
vi.mock('../../trophy/loadViewer', () => ({ loadViewer: vi.fn(async () => false), webglAvailable: () => false }));

vi.mock('../../locales/locales', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../locales/locales')>();
  const ENABLED_LOCALES = ['uk', 'en'] as const;
  return { ...original, ENABLED_LOCALES, isEnabled: (locale: string) => (ENABLED_LOCALES as readonly string[]).includes(locale) };
});

const mine: OwnProfile = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  email: 'o@example.com',
  stats: { games: 3, wins: 1, accuracy: 68, quizzes: 1, hosted: 0, podium: { first: 1, second: 2, third: 0 }, top3: 100, bestScore: 900, avgPlace: 1.7 },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: id === 'first_game', earnedAt: null })),
  quizzes: ['Кіно 90-х', 'Столиці', 'Річки України', 'Мультики', 'Пісні'].map((title, i) => ({ id: `q${i}`, title, plays: i === 0 ? 2 : 1 })),
  wins: [{ gameId: 'g1', title: 'Кіно 90-х', startedAt: '2026-10-12T15:30:00.000Z', rank: 1 }],
  friends: [],
  showcase: { title: null, awards: [], pins: { prizes: [], achievements: [] } },
  level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null } },
  likes: { author: 4, host: 0, player: 1 },
};

const page = (own: boolean): AchievementsPage => ({
  profile: own ? { id: 'u1', nickname: 'Олена', avatar: null } : { id: 'u2', nickname: 'Оля', avatar: null },
  own,
  earned: 0,
  total: ACHIEVEMENTS.length,
  items: own ? ACHIEVEMENTS.map((id) => ({ id, earned: false, earnedAt: null, progress: null })) : [],
});

const signedIn = (admin = false) => vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin });

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: mine });
  vi.mocked(saveMyProfile).mockResolvedValue({ ok: true, data: { id: 'u1', nickname: 'Зірка', avatar: null } });
  vi.mocked(signOut).mockResolvedValue({ ok: true });
  vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getMyAchievements).mockResolvedValue({ ok: true, data: page(true) });
  vi.mocked(getAchievements).mockResolvedValue({ ok: true, data: page(false) });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Where />
    </MemoryRouter>,
  );

const where = () => screen.getByTestId('where').textContent;

const SUBPAGES: [path: string, title: string][] = [
  ['/profile/quizzes', 'Вікторини'],
  ['/profile/prizes', 'Призи'],
  ['/profile/achievements', 'Досягнення'],
  ['/profile/friends', 'Друзі'],
  ['/profile/stats', 'Статистика'],
  ['/profile/likes', 'Вподобання'],
  ['/profile/looks', 'Вигляд'],
  ['/profile/settings', 'Налаштування'],
];

describe('profile sub-pages', () => {
  it.each(SUBPAGES)('%s has the tile title and a back link to the profile', async (path, title) => {
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Назад' });
    expect(back.getAttribute('href')).toBe('/profile');
    expect(back.querySelector('.flip-rtl')).toBeTruthy();
    expect(document.querySelector('main.profile-sub')).toBeTruthy();
  });

  it.each([
    ['/prizes', 'Призи'],
    ['/achievements', 'Досягнення'],
    ['/friends', 'Друзі'],
  ])('the old address %s is an alias with the same page', async (path, title) => {
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/profile');
    expect(where()).toBe(path);
  });

  it.each([
    ['/profile/settings', '/login?next=%2Fprofile%2Fsettings'],
    ['/profile/quizzes', '/login?next=%2Fprofile%2Fquizzes'],
    ['/prizes', '/login?next=%2Fprizes'],
    ['/achievements', '/login?next=%2Fachievements'],
    ['/friends', '/login?next=%2Ffriends'],
  ])('a visitor on %s is sent to sign in and back', async (path, login) => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open(path);
    await waitFor(() => expect(where()).toBe(login));
  });

  it('the public achievements lead back to that profile', async () => {
    open('/profile/u2/achievements');
    expect(await screen.findByRole('link', { name: 'Оля' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/profile/u2');
  });

  it('«Вікторини» lists every quiz with its play count', async () => {
    open('/profile/quizzes');
    await screen.findByRole('link', { name: 'Кіно 90-х' });
    expect([...document.querySelectorAll('.profile-list a bdi')].map((el) => el.textContent)).toEqual(['Кіно 90-х', 'Столиці', 'Річки України', 'Мультики', 'Пісні']);
    expect(screen.getByRole('link', { name: 'Кіно 90-х' }).closest('li')?.textContent).toContain('2 гри');
    expect(screen.queryByRole('button', { name: /^Ще / })).toBeNull();
  });

  it('«Статистика» shows the podium and the wins', async () => {
    const { container } = open('/profile/stats');
    expect(await screen.findByRole('heading', { level: 2, name: 'Перемоги' })).toBeTruthy();
    expect(container.querySelector('.podium-stats')?.textContent).toContain('2-е місце');
    expect(screen.getByText(`${formatDate(mine.wins[0]!.startedAt)} — «Кіно 90-х», 1 місце`)).toBeTruthy();
  });

  it('«Вподобання» shows the likes', async () => {
    open('/profile/likes');
    expect(await screen.findByText('як автор')).toBeTruthy();
  });

  it('«Вигляд» shows the level rewards', async () => {
    open('/profile/looks');
    expect(await screen.findByRole('heading', { level: 2, name: 'Нагороди рівнів' })).toBeTruthy();
  });

  it('«Призи» has the won awards and the store', async () => {
    open('/profile/prizes');
    expect(await screen.findByText('Нагород поки немає — їх вручають у іграх із призами.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Нагороди' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Мої призи' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Новий приз' })).toBeTruthy();
  });
});

describe('«Налаштування»', () => {
  it('shows the email, the language, the public profile link and no admin link', async () => {
    open('/profile/settings');
    expect(await screen.findByText('o@example.com')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Пошта' })).toBeTruthy();
    expect(((await screen.findByLabelText('Мова')) as HTMLSelectElement).options).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Мій публічний профіль' }).getAttribute('href')).toBe('/profile/u1');
    expect(screen.queryByRole('link', { name: 'Адмінка' })).toBeNull();
  });

  it('links to the admin panel for admins', async () => {
    signedIn(true);
    open('/profile/settings');
    expect((await screen.findByRole('link', { name: 'Адмінка' })).getAttribute('href')).toBe('/admin');
  });

  it('opens the nickname form by the button and saves through saveMyProfile', async () => {
    open('/profile/settings');
    expect(await screen.findByRole('heading', { level: 2, name: 'Нікнейм і аватар' })).toBeTruthy();
    expect(screen.queryByLabelText('Нікнейм')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Змінити нікнейм / аватар' }));
    fireEvent.change(screen.getByLabelText('Нікнейм'), { target: { value: 'Зірка' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith({ nickname: 'Зірка', avatar: null }));
    await waitFor(() => expect(getMyProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText('Нікнейм')).toBeNull());
  });

  it('?edit=1 opens the nickname form at once', async () => {
    open('/profile/settings?edit=1');
    fireEvent.change(await screen.findByLabelText('Нікнейм'), { target: { value: 'Зірка' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith({ nickname: 'Зірка', avatar: null }));
  });

  it('signs out', async () => {
    open('/profile/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Вийти' }));
    await waitFor(() => expect(where()).toBe('/'));
    expect(signOut).toHaveBeenCalled();
    expect(vi.mocked(disablePush).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(signOut).mock.invocationCallOrder[0]!);
  });

  it('still signs out when removing the subscription throws', async () => {
    vi.mocked(disablePush).mockRejectedValueOnce(new Error('boom'));
    open('/profile/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Вийти' }));
    await waitFor(() => expect(where()).toBe('/'));
    expect(signOut).toHaveBeenCalled();
  });

  it('signs out after 3 s even when removing the subscription hangs', async () => {
    vi.mocked(disablePush).mockReturnValueOnce(new Promise(() => undefined));
    open('/profile/settings');
    const out = await screen.findByRole('button', { name: 'Вийти' });
    vi.useFakeTimers();
    try {
      fireEvent.click(out);
      await vi.advanceTimersByTimeAsync(2_999);
      expect(signOut).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(signOut).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(where()).toBe('/'));
  });
});
