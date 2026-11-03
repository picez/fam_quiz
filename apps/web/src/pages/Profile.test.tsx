// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, levelProgress, type OwnProfile } from '@quiz/shared';
import { dismissInvite, follow, getMyInvites, getMyProfile, me, saveMyProfile, signOut, uploadImage } from '../api';
import { formatDate } from '../format';
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

const mine: OwnProfile = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  email: 'o@example.com',
  stats: { games: 3, wins: 1, accuracy: 68, quizzes: 1, hosted: 0, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: id === 'first_game', earnedAt: null })),
  quizzes: [{ id: 'q1', title: 'Кіно 90-х', plays: 2 }],
  wins: [{ gameId: 'g1', title: 'Кіно 90-х', startedAt: '2026-10-12T15:30:00.000Z', rank: 1 }],
  friends: [{ id: 'u2', nickname: 'Тарас', avatar: null, lastSeenAt: new Date(Date.now() - 60_000).toISOString() }],
  showcase: { title: null, awards: [], pins: { prizes: [], achievements: [] } },
  level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null } },
  likes: { author: 0, host: 0, player: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: mine });
  vi.mocked(saveMyProfile).mockResolvedValue({ ok: true, data: { id: 'u1', nickname: 'Зірка', avatar: null } });
  vi.mocked(follow).mockResolvedValue({ ok: true });
  vi.mocked(signOut).mockResolvedValue({ ok: true });
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(dismissInvite).mockResolvedValue({ ok: true });
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

describe('Profile', () => {
  it('links to the admin panel for admins only', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: true });
    open();
    expect((await screen.findByRole('link', { name: 'Адмінка' })).getAttribute('href')).toBe('/admin');
    cleanup();
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
    open();
    await screen.findByRole('heading', { name: 'Статистика' });
    expect(screen.queryByRole('link', { name: 'Адмінка' })).toBeNull();
  });

  it('shows the title badge next to the nickname and the «Нагороди» section', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({
      ok: true,
      data: {
        ...mine,
        showcase: {
          title: { text: 'Король', until: '2026-11-06T10:00:00.000Z' },
          pins: { prizes: [], achievements: [] },
          awards: [{ id: 'a1', place: 1, quizTitle: 'Столиці', nickname: 'Олена', awardedAt: '2026-10-30T10:00:00.000Z', content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false } }],
        },
      },
    });
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Нагороди' })).toBeTruthy();
    expect(document.querySelector('h1 .nick-title')?.textContent).toBe('Король');
    expect(screen.getByText('🎁 Піца')).toBeTruthy();
  });

  it('shows the level section and the level badge next to the nickname', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { ...mine, level: { ...mine.level, progress: levelProgress(600), looks: { color: null, frame: null, badge: '⭐' } } } });
    const { container } = open();
    expect(await screen.findByRole('heading', { name: 'Рівень 3' })).toBeTruthy();
    expect(container.querySelector('.profile-head .nick-level')?.textContent).toBe('Рів. 3');
    expect(container.querySelector('.profile-head .profile-badge')?.textContent).toBe('⭐');
    // Рівень — одразу під ніком, перед статистикою; правила досвіду — підказка шкали, пов'язана через aria-describedby.
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.indexOf('Рівень 3')).toBe(0);
    expect(headings.indexOf('Статистика')).toBe(1);
    const info = screen.getByRole('button', { name: 'Як нараховують досвід' });
    expect(document.getElementById(info.getAttribute('aria-describedby')!)?.textContent).toMatch(/щонайменше 3 гравці з акаунтами/);
  });

  it('shows a row of earned badges linking to the achievements page', async () => {
    open();
    expect(await screen.findByText('Олена')).toBeTruthy();
    expect(document.querySelectorAll('ul.achievement-strip > li')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Усі досягнення →' }).getAttribute('href')).toBe('/achievements');
    expect(document.body.textContent).not.toContain('🔒');
  });

  it('shows the podium numbers of the own profile', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({
      ok: true,
      data: { ...mine, stats: { ...mine.stats, podium: { first: 1, second: 2, third: 0 }, top3: 100, bestScore: 900, avgPlace: 1.7 } },
    });
    const { container } = open();
    expect(await screen.findByText('o@example.com')).toBeTruthy();
    const podium = container.querySelector('.podium-stats');
    expect(podium?.textContent).toContain('2-е місце');
    expect(screen.getByText('2-е місце').closest('.stat')?.querySelector('dd')?.textContent).toBe('2');
    expect(screen.getByText('середнє місце').closest('.stat')?.querySelector('dd')?.textContent).toBe('1,7');
  });

  it('shows the sections of the agreed layout in order', async () => {
    const { container } = open();
    expect(await screen.findByText('o@example.com')).toBeTruthy();
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Рівень 1', 'Статистика', 'Вподобання', 'Нагороди рівнів', 'Досягнення', 'Мої вікторини', 'Перемоги']);
    expect(screen.getByRole('link', { name: 'Кіно 90-х' }).getAttribute('href')).toBe('/quizzes/q1');
    expect(screen.getByText(`${formatDate(mine.wins[0].startedAt)} — «Кіно 90-х», 1 місце`)).toBeTruthy();
    // Друзі переїхали на свою сторінку (пункт меню «Друзі»): у профілі їх немає.
    expect(screen.queryByRole('link', { name: /Тарас/ })).toBeNull();
    expect(screen.queryByLabelText('Нікнейм друга')).toBeNull();
    expect(screen.getByRole('link', { name: 'Мій публічний профіль' }).getAttribute('href')).toBe('/profile/u1');
  });

  it('shows invites at the top with join and dismiss', async () => {
    vi.mocked(getMyInvites).mockResolvedValue({
      ok: true,
      data: [{ code: '123456', title: 'Кіно', host: { id: 'h1', nickname: 'Галина', avatar: null }, invitedAt: '2026-10-23T10:00:00.000Z' }],
    });
    const { container } = open();
    await screen.findByRole('heading', { name: 'Вас запросили' });
    expect(container.querySelectorAll('h2')[0]?.textContent).toBe('Вас запросили');
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
    await screen.findByText('o@example.com');
    expect(screen.queryByRole('heading', { name: 'Вас запросили' })).toBeNull();
  });

  it('shows empty sections', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { ...mine, quizzes: [], wins: [], friends: [] } });
    open();
    expect(await screen.findByText('Вікторин поки немає.')).toBeTruthy();
    expect(screen.getByText('Перемог поки немає.')).toBeTruthy();
  });

  it('changes the nickname and the avatar', async () => {
    vi.mocked(uploadImage).mockResolvedValue({ ok: true, url: '/uploads/0123456789abcdef.png' });
    const { container } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Змінити нікнейм / аватар' }));
    fireEvent.change(screen.getByLabelText('Нікнейм'), { target: { value: 'Зірка' } });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file));
    await screen.findByRole('button', { name: 'Прибрати аватар' });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith({ nickname: 'Зірка', avatar: '/uploads/0123456789abcdef.png' }));
    await waitFor(() => expect(getMyProfile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Зберегти' })).toBeNull());
  });

  it('shows a taken nickname and keeps the form open', async () => {
    vi.mocked(saveMyProfile).mockResolvedValue({ ok: false, error: 'nickname_taken' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Змінити нікнейм / аватар' }));
    fireEvent.change(screen.getByLabelText('Нікнейм'), { target: { value: 'Тарас' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Таке ім’я вже зайняте. Виберіть інше.');
    expect((screen.getByLabelText('Нікнейм') as HTMLInputElement).value).toBe('Тарас');
  });

  it('cancels editing', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Змінити нікнейм / аватар' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.getByRole('button', { name: 'Змінити нікнейм / аватар' })).toBeTruthy();
    expect(saveMyProfile).not.toHaveBeenCalled();
  });

  it('removes the avatar', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { ...mine, avatar: '/uploads/0123456789abcdef.png' } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Змінити нікнейм / аватар' }));
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати аватар' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith({ nickname: 'Олена', avatar: null }));
  });

  it('shows the top three quizzes with their play counts', async () => {
    const quizzes = ['Хіт', 'Друга', 'Третя', 'Четверта', 'П’ята'].map((title, i) => ({ id: 'q' + i, title, plays: 5 - i }));
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { ...mine, quizzes } });
    open();
    expect((await screen.findByRole('link', { name: 'Хіт' })).closest('li')?.textContent).toContain('5 ігор');
    expect([...document.querySelectorAll('.popular-quizzes a bdi')].map((el) => el.textContent)).toEqual(['Хіт', 'Друга', 'Третя']);
    expect(screen.queryByRole('button', { name: /^Ще / })).toBeNull();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('на /login?next=%2Fprofile')).toBeTruthy();
    expect(screen.queryByText('Статистика')).toBeNull();
  });

  it('has the language field', async () => {
    open();
    expect(((await screen.findByLabelText('Мова')) as HTMLSelectElement).options).toHaveLength(2);
  });
});
