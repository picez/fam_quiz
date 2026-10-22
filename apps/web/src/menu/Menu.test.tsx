// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyInvites, me } from '../api';
import { announceInvitesChanged } from '../useInvites';
import { WithMenu } from './WithMenu';

vi.mock('../api', () => ({ me: vi.fn(), getMyInvites: vi.fn() }));

const OK = { ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' } as const;
const OUT = { ok: false, error: 'unauthorized' } as const;

beforeEach(() => {
  vi.mocked(me).mockReset();
  vi.mocked(getMyInvites).mockReset();
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
});
afterEach(cleanup);

const items = () =>
  within(screen.getByRole('navigation', { name: 'Меню' }))
    .getAllByRole('link')
    .map((l) => l.textContent);

function Go() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/quizzes')}>
      далі
    </button>
  );
}

function show(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<WithMenu />}>
          <Route path="/login" element={<Go />} />
          <Route path="*" element={<><p>сторінка</p><Go /></>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Menu', () => {
  it('a visitor sees only join and sign in, and sign in returns to the page', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/history/abc');
    await vi.waitFor(() => expect(items()).toEqual(['🎮Приєднатися', '🔑Увійти']));
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe('/login?next=%2Fhistory%2Fabc');
  });

  it('a signed-in person sees join, quizzes, history and profile with the current one marked', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/me');
    await screen.findByRole('link', { name: 'Профіль' });
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect([href('Приєднатися'), href('Мої вікторини'), href('Історія'), href('Профіль')]).toEqual(['/', '/quizzes', '/history', '/profile']);
    expect(screen.getByRole('link', { name: 'Історія' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBeNull();
  });

  it('while it is unknown who is here, only join is offered', async () => {
    vi.mocked(me).mockReturnValue(new Promise(() => {}));
    show('/');
    expect(items()).toEqual(['🎮Приєднатися']);
  });

  it('the menu follows sign-in and sign-out without a reload', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/login');
    await vi.waitFor(() => expect(items()).toEqual(['🎮Приєднатися', '🔑Увійти']));
    vi.mocked(me).mockResolvedValue(OK);
    fireEvent.click(screen.getByRole('button', { name: 'далі' }));
    expect(await screen.findByRole('link', { name: 'Профіль' })).toBeTruthy();
    vi.mocked(me).mockResolvedValue(OUT);
    fireEvent.click(screen.getByRole('button', { name: 'далі' }));
    await vi.waitFor(() => expect(items()).toEqual(['🎮Приєднатися', '🔑Увійти']));
  });

  it('sign in keeps the query of the page, and on the login page does not nest itself', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    const first = show('/history?x=1');
    await screen.findByRole('link', { name: 'Увійти' });
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe('/login?next=%2Fhistory%3Fx%3D1');
    first.unmount();
    show('/login?next=%2Fquizzes');
    await screen.findByRole('link', { name: 'Увійти' });
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe('/login?next=%2Fquizzes');
  });

  describe('invites badge', () => {
    const invite = (code: string) => ({ code, title: 'Кіно', host: { id: 'h', nickname: 'Галина', avatar: null }, invitedAt: '2026-10-23T10:00:00.000Z' });

    it('shows the number of invites on the profile item', async () => {
      vi.mocked(me).mockResolvedValue(OK);
      vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [invite('111111'), invite('222222')] });
      show('/quizzes');
      const badge = await screen.findByLabelText('Запрошень: 2');
      expect(badge.textContent).toBe('2');
      cleanup();

      vi.mocked(getMyInvites).mockClear();
      vi.mocked(me).mockResolvedValue(OUT);
      show('/quizzes');
      await vi.waitFor(() => expect(items()).toEqual(['🎮Приєднатися', '🔑Увійти']));
      expect(getMyInvites).not.toHaveBeenCalled();
    });

    it('dismissing an invite updates the menu badge at once', async () => {
      vi.mocked(me).mockResolvedValue(OK);
      vi.mocked(getMyInvites).mockResolvedValueOnce({ ok: true, data: [invite('111111')] });
      show('/quizzes');
      await screen.findByLabelText('Запрошень: 1');
      vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
      announceInvitesChanged();
      await vi.waitFor(() => expect(screen.queryByLabelText('Запрошень: 1')).toBeNull());
    });
  });
});
