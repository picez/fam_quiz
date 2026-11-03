// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeedBadge, getMyInvites, me } from '../api';
import { announceInvitesChanged } from '../useInvites';
import { WithMenu } from './WithMenu';

vi.mock('../api', () => ({ me: vi.fn(), getMyInvites: vi.fn(), getFeedBadge: vi.fn() }));

const OK = { ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false } as const;
const OUT = { ok: false, error: 'unauthorized' } as const;

beforeEach(() => {
  vi.mocked(me).mockReset();
  vi.mocked(getMyInvites).mockReset();
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getFeedBadge).mockReset();
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
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

  it('a signed-in person sees join, feed, quizzes, history, prizes, achievements, friends and profile with the current one marked', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/me');
    await screen.findByRole('link', { name: 'Профіль' });
    expect(items()).toEqual(['🎮Приєднатися', '📰Стрічка', '📝Мої вікторини', '🕘Історія', '🎁Призи', '🏅Досягнення', '👥Друзі', '👤Профіль']);
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect([href('Приєднатися'), href('Стрічка'), href('Мої вікторини'), href('Історія'), href('Призи'), href('Досягнення'), href('Друзі'), href('Профіль')]).toEqual([
      '/',
      '/feed',
      '/quizzes',
      '/history',
      '/prizes',
      '/achievements',
      '/friends',
      '/profile',
    ]);
    expect(screen.getByRole('link', { name: 'Історія' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBeNull();
  });

  it('every item keeps its full name for assistive tech and carries a short label for the narrow bar', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/');
    await screen.findByRole('link', { name: 'Профіль' });
    const links = within(screen.getByRole('navigation', { name: 'Меню' })).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['Приєднатися', 'Стрічка', 'Мої вікторини', 'Історія', 'Призи', 'Досягнення', 'Друзі', 'Профіль']);
    expect(links.map((l) => l.getAttribute('data-short'))).toEqual(['Гра', 'Стрічка', 'Квізи', 'Історія', 'Призи', 'Ачівки', 'Друзі', 'Профіль']);
  });

  it('prizes are marked on their page and a visitor does not see them', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/prizes');
    await screen.findByRole('link', { name: 'Призи' });
    expect(screen.getByRole('link', { name: 'Призи' }).getAttribute('aria-current')).toBe('page');
    expect(items().indexOf('🎁Призи')).toBe(4);
    cleanup();
    vi.mocked(me).mockResolvedValue(OUT);
    show('/prizes');
    await vi.waitFor(() => expect(items()).toEqual(['🎮Приєднатися', '🔑Увійти']));
  });

  it('achievements are marked on their page, and another player’s achievements belong to the profile', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/achievements');
    await screen.findByRole('link', { name: 'Досягнення' });
    expect(screen.getByRole('link', { name: 'Досягнення' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBeNull();
    cleanup();
    show('/profile/u2/achievements');
    await screen.findByRole('link', { name: 'Досягнення' });
    expect(screen.getByRole('link', { name: 'Досягнення' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBe('page');
  });

  it('friends are marked on their page, and a friend’s profile belongs to the profile item', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/friends');
    await screen.findByRole('link', { name: 'Друзі' });
    expect(screen.getByRole('link', { name: 'Друзі' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBeNull();
    cleanup();
    show('/profile/u2');
    await screen.findByRole('link', { name: 'Друзі' });
    expect(screen.getByRole('link', { name: 'Друзі' }).getAttribute('aria-current')).toBeNull();
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

  describe('feed item', () => {
    it('is marked on the feed and its sub-pages', async () => {
      vi.mocked(me).mockResolvedValue(OK);
      show('/feed');
      await screen.findByRole('link', { name: 'Стрічка' });
      expect(screen.getByRole('link', { name: 'Стрічка' }).getAttribute('aria-current')).toBe('page');
      cleanup();
      show('/feed/calendar');
      await screen.findByRole('link', { name: 'Стрічка' });
      expect(screen.getByRole('link', { name: 'Стрічка' }).getAttribute('aria-current')).toBe('page');
    });

    it('shows the total of new events as a badge, capped at 99+, and none for zero', async () => {
      vi.mocked(me).mockResolvedValue(OK);
      vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 3, requests: 0, decisions: 0 });
      show('/quizzes');
      const link = await screen.findByRole('link', { name: 'Стрічка, Нових подій: 3' });
      const badge = link.querySelector('.menu-badge')!;
      expect(badge.textContent).toBe('3');
      // Число вже в aria-label пункту: бейдж читачеві екрана не повторюється.
      expect(badge.getAttribute('aria-hidden')).toBe('true');
      expect(screen.queryByLabelText('Нових подій: 3')).toBeNull();
      cleanup();
      vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 120, requests: 0, decisions: 0 });
      show('/quizzes');
      expect((await screen.findByRole('link', { name: 'Стрічка, Нових подій: 120' })).querySelector('.menu-badge')!.textContent).toBe('99+');
      cleanup();
      vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
      show('/quizzes');
      await screen.findByRole('link', { name: 'Стрічка' });
      expect(document.querySelectorAll('.menu-badge').length).toBe(0);
    });

    it('a visitor does not see the feed and the badge is not requested', async () => {
      vi.mocked(me).mockResolvedValue(OUT);
      show('/quizzes');
      await vi.waitFor(() => expect(items()).toEqual(['🎮Приєднатися', '🔑Увійти']));
      expect(getFeedBadge).not.toHaveBeenCalled();
    });
  });

  describe('invites badge', () => {
    const invite = (code: string) => ({ code, title: 'Кіно', host: { id: 'h', nickname: 'Галина', avatar: null }, invitedAt: '2026-10-23T10:00:00.000Z' });

    it('shows the number of invites on the profile item', async () => {
      vi.mocked(me).mockResolvedValue(OK);
      vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [invite('111111'), invite('222222')] });
      show('/quizzes');
      const link = await screen.findByRole('link', { name: 'Профіль, Запрошень: 2' });
      const badge = link.querySelector('.menu-badge')!;
      expect(badge.textContent).toBe('2');
      expect(badge.getAttribute('aria-hidden')).toBe('true');
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
      await screen.findByRole('link', { name: 'Профіль, Запрошень: 1' });
      vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
      announceInvitesChanged();
      await vi.waitFor(() => expect(screen.queryByRole('link', { name: 'Профіль, Запрошень: 1' })).toBeNull());
      expect(document.querySelectorAll('.menu-badge').length).toBe(0);
    });
  });
});
