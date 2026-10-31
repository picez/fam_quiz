// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, type OwnProfile } from '@quiz/shared';
import { dismissInvite, findProfile, follow, getMyInvites, getMyProfile, me, saveMyProfile, searchProfiles, signOut, uploadImage } from '../api';
import { formatDate } from '../format';
import { Profile } from './Profile';

vi.mock('../api', () => ({
  me: vi.fn(),
  getMyProfile: vi.fn(),
  saveMyProfile: vi.fn(),
  findProfile: vi.fn(),
  searchProfiles: vi.fn(async () => ({ ok: true, data: [] })),
  follow: vi.fn(),
  uploadImage: vi.fn(),
  signOut: vi.fn(),
  getMyInvites: vi.fn(),
  dismissInvite: vi.fn(),
}));

const mine: OwnProfile = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  email: 'o@example.com',
  stats: { games: 3, wins: 1, accuracy: 68, quizzes: 1, hosted: 0, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: id === 'first_game', earnedAt: null })),
  quizzes: [{ id: 'q1', title: 'Кіно 90-х' }],
  wins: [{ gameId: 'g1', title: 'Кіно 90-х', startedAt: '2026-10-12T15:30:00.000Z', rank: 1 }],
  friends: [{ id: 'u2', nickname: 'Тарас', avatar: null, lastSeenAt: new Date(Date.now() - 60_000).toISOString() }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
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
    expect(headings).toEqual(['Статистика', 'Досягнення', 'Мої вікторини', 'Перемоги', 'Друзі']);
    expect(screen.getByRole('link', { name: 'Кіно 90-х →' }).getAttribute('href')).toBe('/quizzes/q1');
    expect(screen.getByText(`${formatDate(mine.wins[0].startedAt)} — «Кіно 90-х», 1 місце`)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Тарас/ }).getAttribute('href')).toBe('/profile/u2');
    // Друг заходив хвилину тому — онлайн (беклог 9).
    expect(screen.getByText('онлайн').className).toBe('friend-seen is-online');
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
    expect(screen.getByText('Друзів поки немає.')).toBeTruthy();
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

  it('adds a friend by nickname and explains an unknown one', async () => {
    vi.mocked(findProfile).mockResolvedValueOnce({ ok: false, error: 'not_found' });
    open();
    const field = await screen.findByLabelText('Нікнейм друга');
    fireEvent.change(field, { target: { value: 'Хтось' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати друга' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Гравця з таким нікнеймом не знайдено.');
    expect(follow).not.toHaveBeenCalled();

    vi.mocked(findProfile).mockResolvedValueOnce({ ok: true, data: { id: 'u3', nickname: 'Іра', avatar: null } });
    fireEvent.change(field, { target: { value: 'Іра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати друга' }));
    await waitFor(() => expect(follow).toHaveBeenCalledWith('u3'));
    await waitFor(() => expect(getMyProfile).toHaveBeenCalledTimes(2));
  });

  it('suggests nicknames that start with what is typed (backlog 9)', async () => {
    vi.mocked(searchProfiles).mockResolvedValue({ ok: true, data: [{ id: 'u3', nickname: 'Іра', avatar: null }, { id: 'u4', nickname: 'Ірина', avatar: null }] });
    open();
    fireEvent.change(await screen.findByLabelText('Нікнейм друга'), { target: { value: 'Ір' } });
    await waitFor(() => expect(searchProfiles).toHaveBeenCalledWith('Ір'));
    await waitFor(() => expect(Array.from(document.querySelectorAll('#friend-hints option')).map((o) => o.getAttribute('value'))).toEqual(['Іра', 'Ірина']));
  });

  it('refuses to add yourself and ignores a double click', async () => {
    vi.mocked(findProfile).mockResolvedValue({ ok: true, data: { id: 'u3', nickname: 'Іра', avatar: null } });
    vi.mocked(follow).mockResolvedValue({ ok: false, error: 'self_follow' });
    open();
    fireEvent.change(await screen.findByLabelText('Нікнейм друга'), { target: { value: 'Іра' } });
    const add = screen.getByRole('button', { name: 'Додати друга' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect((await screen.findByRole('alert')).textContent).toBe('Себе додати в друзі не можна.');
    expect(findProfile).toHaveBeenCalledTimes(1);
  });

  it('signs out from the profile', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Вийти' }));
    expect(await screen.findByText('на /')).toBeTruthy();
    expect(signOut).toHaveBeenCalled();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('на /login?next=%2Fprofile')).toBeTruthy();
    expect(screen.queryByText('Статистика')).toBeNull();
  });
});
