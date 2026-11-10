// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import type { FriendCard } from '@quiz/shared';
import { findProfile, follow, getMyFriends, me, searchProfiles } from '../api';
import { Friends } from './Friends';

vi.mock('../api', () => ({
  me: vi.fn(),
  getMyFriends: vi.fn(),
  findProfile: vi.fn(),
  searchProfiles: vi.fn(async () => ({ ok: true, data: [] })),
  follow: vi.fn(),
}));

const friends: FriendCard[] = [
  { id: 'u2', nickname: 'Тарас', avatar: null, lastSeenAt: new Date(Date.now() - 60_000).toISOString() },
  { id: 'u3', nickname: 'Оля', avatar: null, lastSeenAt: null },
];

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: friends });
  vi.mocked(follow).mockResolvedValue({ ok: true });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = () =>
  render(
    <MemoryRouter initialEntries={['/friends']}>
      <Routes>
        <Route path="/friends" element={<Friends />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Friends', () => {
  it('lists friends with their profile links and who is online', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Друзі' })).toBeTruthy();
    expect((await screen.findByRole('link', { name: /Тарас/ })).getAttribute('href')).toBe('/profile/u2');
    expect(screen.getByRole('link', { name: /Оля/ }).getAttribute('href')).toBe('/profile/u3');
    // Друг заходив хвилину тому — онлайн (беклог 9).
    expect(screen.getByText('онлайн').className).toBe('friend-seen is-online');
  });

  it('says there are no friends yet and still offers to add one', async () => {
    vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText('Друзів поки немає.')).toBeTruthy();
    expect(screen.getByLabelText('Нікнейм друга')).toBeTruthy();
  });

  it('adds a friend by nickname and explains an unknown one', async () => {
    vi.mocked(findProfile).mockResolvedValueOnce({ ok: false, error: 'not_found' });
    open();
    const field = await screen.findByLabelText('Нікнейм друга');
    fireEvent.change(field, { target: { value: 'Хтось' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати друга' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Гравця з таким нікнеймом не знайдено.');
    expect(follow).not.toHaveBeenCalled();

    vi.mocked(findProfile).mockResolvedValueOnce({ ok: true, data: { id: 'u4', nickname: 'Іра', avatar: null } });
    fireEvent.change(field, { target: { value: 'Іра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Додати друга' }));
    await waitFor(() => expect(follow).toHaveBeenCalledWith('u4'));
    await waitFor(() => expect(getMyFriends).toHaveBeenCalledTimes(2));
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

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('на /login?next=%2Ffriends')).toBeTruthy();
    expect(getMyFriends).not.toHaveBeenCalled();
  });
});
