// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfile as PublicProfileData } from '@quiz/shared';
import { follow, getProfile, me, unfollow } from '../api';
import { PublicProfile } from './PublicProfile';

vi.mock('../api', () => ({ me: vi.fn(), getProfile: vi.fn(), follow: vi.fn(), unfollow: vi.fn() }));

const profile = (over: Partial<PublicProfileData> = {}): PublicProfileData => ({
  id: 'u2',
  nickname: 'Тарас',
  avatar: null,
  stats: { games: 3, wins: 1, accuracy: 70, quizzes: 2, hosted: 0 },
  achievements: [{ id: 'first_game', earned: true }],
  following: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
  vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile() });
  vi.mocked(follow).mockResolvedValue({ ok: true });
  vi.mocked(unfollow).mockResolvedValue({ ok: true });
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
  it('shows a public profile without email and adds to friends', async () => {
    open();
    expect(await screen.findByText('Тарас')).toBeTruthy();
    expect(screen.getByText('email приховано')).toBeTruthy();
    expect(screen.getByText('Статистика')).toBeTruthy();
    expect(screen.getByText('Ачівки')).toBeTruthy();
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
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u2', name: 'Тарас', email: 't@example.com' });
    vi.mocked(getProfile).mockResolvedValue({ ok: true, data: profile({ following: null }) });
    open();
    const link = await screen.findByRole('link', { name: 'Це ваш профіль' });
    expect(link.getAttribute('href')).toBe('/profile');
  });

  it('an unknown profile says so', async () => {
    vi.mocked(getProfile).mockResolvedValue({ ok: false, error: 'not_found' });
    open();
    expect(await screen.findByText('Такого профілю немає.')).toBeTruthy();
  });
});
