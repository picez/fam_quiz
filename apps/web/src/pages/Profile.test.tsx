// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { ACHIEVEMENTS, levelProgress, type AwardCard, type OwnProfile } from '@quiz/shared';
import { dismissInvite, getGroupInvites, getGroups, getMyInvites, getMyProfile, me } from '../api';
import { Profile } from './Profile';

vi.mock('../push/push-client', () => ({
  browserEnv: vi.fn(() => ({})),
  pushSupport: vi.fn(() => 'unsupported'),
  currentSubscription: vi.fn(async () => null),
  sameKey: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(async () => undefined),
}));

vi.mock('../api', () => ({
  me: vi.fn(),
  getMyProfile: vi.fn(),
  saveMyProfile: vi.fn(),
  findProfile: vi.fn(),
  searchProfiles: vi.fn(async () => ({ ok: true, data: [] })),
  follow: vi.fn(),
  uploadImage: vi.fn(),
  signOut: vi.fn(),
  getPushKey: vi.fn(async () => ({ ok: true, publicKey: null })),
  getMyInvites: vi.fn(),
  getGroupInvites: vi.fn(),
  getGroups: vi.fn(),
  getFeedBadge: vi.fn(async () => ({ ok: true, events: 0, requests: 0, decisions: 0 })),
  dismissInvite: vi.fn(),
  saveLooks: vi.fn(),
  saveMyLocale: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../locales/locales', async (importOriginal) => {
  const original = await importOriginal<typeof import('../locales/locales')>();
  const ENABLED_LOCALES = ['uk', 'en'] as const;
  return { ...original, ENABLED_LOCALES, isEnabled: (locale: string) => (ENABLED_LOCALES as readonly string[]).includes(locale) };
});

const award = (id: string): AwardCard => ({
  id,
  place: 1,
  quizTitle: 'Столиці',
  nickname: 'Олена',
  awardedAt: '2026-10-30T10:00:00.000Z',
  content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false },
});

const mine: OwnProfile = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  email: 'o@example.com',
  stats: { games: 3, wins: 1, accuracy: 68, quizzes: 5, hosted: 0, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: id === 'first_game', earnedAt: null })),
  quizzes: ['Хіт', 'Друга', 'Третя', 'Четверта', 'П’ята'].map((title, i) => ({ id: 'q' + i, title, plays: 5 - i })),
  wins: [{ gameId: 'g1', title: 'Хіт', startedAt: '2026-10-12T15:30:00.000Z', rank: 1 }],
  friends: [{ id: 'u2', nickname: 'Тарас', avatar: null, lastSeenAt: new Date(Date.now() - 60_000).toISOString() }],
  showcase: { title: null, awards: [award('a1'), award('a2')], pins: { prizes: [], achievements: [] } },
  level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null, photo: null, font: null, effect: null } },
  likes: { author: 0, host: 0, player: 0 },
};

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: true });
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: mine });
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(dismissInvite).mockResolvedValue({ ok: true });
  vi.mocked(getGroupInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [], invites: [] });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = () =>
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const tiles = () => screen.getByRole('navigation', { name: 'Розділи профілю' });
const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Profile', () => {
  it('shows the header, the tiles and the popular quizzes in order', async () => {
    const { container } = open();
    const nav = await screen.findByRole('navigation', { name: 'Розділи профілю' });
    const head = container.querySelector('header.profile-head')!;
    const popular = screen.getByRole('heading', { name: 'Найпопулярніші вікторини' });
    expect(before(head, nav)).toBe(true);
    expect(before(nav, popular)).toBe(true);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Олена');
    expect(screen.getByRole('link', { name: /Змінити нікнейм \/ аватар/ }).getAttribute('href')).toBe('/profile/settings?edit=1');
    expect(screen.getByRole('heading', { name: 'Рівень 1' })).toBeTruthy();
  });

  it('puts the invites between the header and the tiles', async () => {
    vi.mocked(getMyInvites).mockResolvedValue({
      ok: true,
      data: [{ code: '123456', title: 'Кіно', host: { id: 'h1', nickname: 'Галина', avatar: null }, invitedAt: '2026-10-23T10:00:00.000Z' }],
    });
    const { container } = open();
    const invites = await screen.findByRole('heading', { name: 'Вас запросили' });
    expect(before(container.querySelector('header.profile-head')!, invites)).toBe(true);
    expect(before(invites, tiles())).toBe(true);
  });

  it('has nine tiles leading to the sub-pages, with counts; the last one is the wide «Групи» (12k)', async () => {
    const card = (id: string) => ({ id, name: 'Родина', emoji: '🌻' as const, description: '', role: 'member' as const, people: 2, items: 0, joinedAt: '2026-11-14T10:00:00.000Z' });
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [card('g1'), card('g2')], invites: [] });
    vi.mocked(getGroupInvites).mockResolvedValue({ ok: true, data: [{ group: { id: 'g3', name: 'Клас', emoji: '🎓', people: 3 }, from: null, at: '2026-11-14T10:00:00.000Z' }] });
    open();
    await screen.findByRole('navigation', { name: 'Розділи профілю' });
    const wide = await screen.findByRole('link', { name: 'Групи, 2, Запрошень: 1' });
    expect(wide.getAttribute('href')).toBe('/profile/groups');
    expect(wide.classList.contains('is-wide')).toBe(true);
    expect(wide.querySelector('.menu-badge')!.textContent).toBe('1');
    expect([...tiles().querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/profile/quizzes',
      '/profile/prizes',
      '/profile/achievements',
      '/profile/friends',
      '/profile/stats',
      '/profile/likes',
      '/profile/looks',
      '/profile/settings',
      '/profile/groups',
    ]);
    expect(screen.getByRole('link', { name: 'Вікторини, 5' }).getAttribute('href')).toBe('/profile/quizzes');
    expect(screen.getByRole('link', { name: 'Призи, 2' }).getAttribute('href')).toBe('/profile/prizes');
    expect(screen.getByRole('link', { name: 'Досягнення, 1' }).getAttribute('href')).toBe('/profile/achievements');
    expect(screen.getByRole('link', { name: 'Друзі' }).getAttribute('href')).toBe('/profile/friends');
    expect(screen.getByRole('link', { name: 'Налаштування' }).getAttribute('href')).toBe('/profile/settings');
    expect(tiles().querySelectorAll('.tile-count')).toHaveLength(4);
  });

  it('after the tiles shows the trophy shelf and the achievements, with links to all', async () => {
    open();
    const nav = await screen.findByRole('navigation', { name: 'Розділи профілю' });
    const shelf = screen.getByRole('heading', { name: /Вітрина кубків/ });
    const achievements = screen.getByRole('heading', { name: /Ачівки · 1 з 71/ });
    expect(before(nav, shelf)).toBe(true);
    expect(before(shelf, achievements)).toBe(true);
    expect(before(achievements, screen.getByRole('heading', { name: 'Найпопулярніші вікторини' }))).toBe(true);
    expect(screen.getByRole('link', { name: /усі призи/ }).getAttribute('href')).toBe('/profile/prizes');
    expect(shelf.closest('section')!.querySelectorAll('.shelf-item')).toHaveLength(2);
    expect(achievements.closest('section')!.querySelector('a')!.getAttribute('href')).toBe('/profile/achievements');
    expect(screen.getByRole('button', { name: 'Перша гра' })).toBeTruthy();
  });

  it('shows the top three quizzes with their play counts and «усі»', async () => {
    open();
    expect((await screen.findByRole('link', { name: 'Хіт' })).closest('li')?.textContent).toContain('5 ігор');
    expect([...document.querySelectorAll('.popular-quizzes a bdi')].map((el) => el.textContent)).toEqual(['Хіт', 'Друга', 'Третя']);
    expect(within(screen.getByRole('heading', { name: 'Найпопулярніші вікторини' }).closest('section')!).getByRole('link', { name: /^усі/ }).getAttribute('href')).toBe('/profile/quizzes');
  });

  it('keeps the rest on the sub-pages', async () => {
    open();
    await screen.findByRole('navigation', { name: 'Розділи профілю' });
    expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull();
    expect(screen.queryByText('o@example.com')).toBeNull();
    expect(screen.queryByLabelText('Мова')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Адмінка' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Статистика' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Перемоги' })).toBeNull();
  });

  it('shows invites at the top with join and dismiss', async () => {
    vi.mocked(getMyInvites).mockResolvedValue({
      ok: true,
      data: [{ code: '123456', title: 'Кіно', host: { id: 'h1', nickname: 'Галина', avatar: null }, invitedAt: '2026-10-23T10:00:00.000Z' }],
    });
    const { container } = open();
    await screen.findByRole('heading', { name: 'Вас запросили' });
    expect(before(container.querySelector('header.profile-head')!, screen.getByRole('heading', { name: 'Вас запросили' }))).toBe(true);
    expect(screen.getByText('Галина запрошує: «Кіно», код 123 456')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Приєднатися' }).getAttribute('href')).toBe('/play/123456');
    fireEvent.click(screen.getByRole('button', { name: 'Відхилити' }));
    await waitFor(() => expect(dismissInvite).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(screen.queryByText('Галина запрошує: «Кіно», код 123 456')).toBeNull());
  });

  it('keeps the invite and shows an error when dismissing fails', async () => {
    vi.mocked(getMyInvites).mockResolvedValue({
      ok: true,
      data: [{ code: '123456', title: 'Кіно', host: { id: 'h1', nickname: 'Галина', avatar: null }, invitedAt: '2026-10-23T10:00:00.000Z' }],
    });
    vi.mocked(dismissInvite).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Відхилити' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Немає зв’язку із сервером.');
    expect(screen.getByText('Галина запрошує: «Кіно», код 123 456')).toBeTruthy();
  });

  it('does not ask for invites when signed out', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    vi.mocked(getMyInvites).mockClear();
    open();
    await screen.findByText(/на \/login/);
    expect(getMyInvites).not.toHaveBeenCalled();
  });

  it('has no invite block without invites', async () => {
    open();
    await screen.findByRole('navigation', { name: 'Розділи профілю' });
    expect(screen.queryByRole('heading', { name: 'Вас запросили' })).toBeNull();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('на /login?next=%2Fprofile')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Розділи профілю' })).toBeNull();
  });
});
