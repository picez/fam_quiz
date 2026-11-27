// @vitest-environment jsdom
// Стилі читаються з диска (Vitest підміняє CSS порожнім рядком); типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { getFeedBadge, getGroupInvites, getInboxBadge, getMyInvites, me } from '../api';
import { setInboxUnread } from '../inbox/useInboxBadge';
import { announceInvitesChanged } from '../useInvites';
import { WithMenu } from './WithMenu';

vi.mock('../api', () => ({ me: vi.fn(), getMyInvites: vi.fn(), getGroupInvites: vi.fn(), getFeedBadge: vi.fn(), getInboxBadge: vi.fn(), getAnnouncement: async () => ({ ok: false, error: 'offline' }) }));

const OK = { ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false } as const;
const OUT = { ok: false, error: 'unauthorized' } as const;

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  vi.mocked(me).mockReset();
  vi.mocked(getMyInvites).mockReset();
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getGroupInvites).mockReset();
  vi.mocked(getGroupInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getFeedBadge).mockReset();
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
  vi.mocked(getInboxBadge).mockReset();
  vi.mocked(getInboxBadge).mockResolvedValue({ ok: true, unread: 0 });
  act(() => setInboxUnread(0));
});
afterEach(cleanup);

// Дзвіночок «Вхідних» (70) — не пункт меню: склад пунктів рахується без нього.
const menuLinks = () => Array.from(screen.getByRole('navigation', { name: 'Меню' }).querySelectorAll('a:not(.menu-inbox)'));
const items = () => menuLinks().map((l) => l.textContent);

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
  it('a visitor sees join, the library and sign in, and sign in returns to the page', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/history/abc');
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe('/login?next=%2Fhistory%2Fabc');
  });

  it('a signed-in person sees join, feed, quizzes, history and profile with the current one marked', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/me');
    await screen.findByRole('link', { name: 'Профіль' });
    expect(items()).toEqual(['🏠Головна', '📝Вікторини', '📰Стрічка', '🕘Історія', '👤Профіль']);
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect([href('Головна'), href('Вікторини'), href('Стрічка'), href('Історія'), href('Профіль')]).toEqual(['/', '/quizzes', '/feed', '/history', '/profile']);
    expect(screen.getByRole('link', { name: 'Історія' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBeNull();
    const hrefs = menuLinks().map((l) => l.getAttribute('href'));
    expect(hrefs.filter((h) => ['/prizes', '/achievements', '/friends'].includes(h!))).toEqual([]);
  });

  it('every item keeps its full name for assistive tech and carries a short label for the narrow bar', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/');
    await screen.findByRole('link', { name: 'Профіль' });
    const links = menuLinks();
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['Головна', 'Вікторини', 'Стрічка', 'Історія', 'Профіль']);
    expect(links.map((l) => l.getAttribute('data-short'))).toEqual(['Головна', 'Вікторини', 'Стрічка', 'Історія', 'Профіль']);
  });

  it.each(['/profile', '/profile/prizes', '/prizes', '/achievements', '/friends', '/profile/u2', '/profile/u2/achievements'])('the profile is marked on %s', async (path) => {
    vi.mocked(me).mockResolvedValue(OK);
    show(path);
    await screen.findByRole('link', { name: 'Профіль' });
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBe('page');
    expect(items()).toHaveLength(5);
  });

  it('six items (admin) use the tighter short label «Вікт.», five items keep «Вікторини» (77)', async () => {
    vi.mocked(me).mockResolvedValue({ ...OK, admin: true });
    show('/');
    await screen.findByRole('link', { name: 'Адмінка' });
    const quizzes = screen.getByRole('link', { name: 'Вікторини' });
    expect(quizzes.getAttribute('data-short')).toBe('Вікт.');
    expect(menuLinks().map((l) => l.getAttribute('data-short'))).toEqual(['Головна', 'Вікт.', 'Стрічка', 'Історія', 'Профіль', 'Адмінка']);
    cleanup();
    forgetAccount();
    vi.mocked(me).mockResolvedValue(OK);
    show('/');
    expect((await screen.findByRole('link', { name: 'Вікторини' })).getAttribute('data-short')).toBe('Вікторини');
  });

  it('an admin gets the admin panel last, marked under /admin; others and visitors do not', async () => {
    vi.mocked(me).mockResolvedValue({ ...OK, admin: true });
    show('/admin/users');
    await screen.findByRole('link', { name: 'Адмінка' });
    expect(items()).toEqual(['🏠Головна', '📝Вікторини', '📰Стрічка', '🕘Історія', '👤Профіль', '🛠️Адмінка']);
    const link = screen.getByRole('link', { name: 'Адмінка' });
    expect(link.getAttribute('href')).toBe('/admin');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Профіль' }).getAttribute('aria-current')).toBeNull();
    cleanup();
    forgetAccount();
    vi.mocked(me).mockResolvedValue(OK);
    show('/admin');
    await screen.findByRole('link', { name: 'Профіль' });
    expect(screen.queryByRole('link', { name: 'Адмінка' })).toBeNull();
    cleanup();
    forgetAccount();
    vi.mocked(me).mockResolvedValue(OUT);
    show('/admin');
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
  });

  it('a visitor gets the library in the menu with its address', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/library');
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
    expect(screen.getByRole('link', { name: 'Бібліотека' }).getAttribute('href')).toBe('/library');
    expect(screen.getByRole('link', { name: 'Бібліотека' }).getAttribute('data-short')).toBe('Бібліотека');
  });

  it.each([
    ['/create', 'Вікторини'],
    ['/help', 'Вікторини'],
    ['/challenge/AB12', 'Вікторини'],
    ['/quizzes/liked', 'Вікторини'],
    ['/report', 'Головна'],
    ['/', 'Головна'],
    ['/feed/calendar', 'Стрічка'],
    ['/me', 'Історія'],
    ['/groups/join/abc', 'Профіль'],
  ])('a signed-in person on %s sees exactly «%s» marked (77)', async (path, name) => {
    vi.mocked(me).mockResolvedValue(OK);
    show(path);
    await screen.findByRole('link', { name: 'Профіль' });
    expect(menuLinks().filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.getAttribute('aria-label'))).toEqual([name]);
  });

  it.each([
    ['/library/e1', 'Бібліотека'],
    ['/help', 'Головна'],
    ['/report', 'Головна'],
    ['/login', 'Увійти'],
  ])('a visitor on %s sees exactly «%s» marked (77)', async (path, name) => {
    vi.mocked(me).mockResolvedValue(OUT);
    show(path);
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
    expect(menuLinks().filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.getAttribute('aria-label'))).toEqual([name]);
  });

  it.each(['/library', '/library/e1'])('a signed-in person keeps five items and sees Quizzes marked on %s', async (path) => {
    vi.mocked(me).mockResolvedValue(OK);
    show(path);
    await screen.findByRole('link', { name: 'Профіль' });
    expect(items()).toHaveLength(5);
    expect(screen.queryByRole('link', { name: 'Бібліотека' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Вікторини' }).getAttribute('aria-current')).toBe('page');
  });

  it('a visitor on the prizes page still sees only join and sign in', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/prizes');
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
  });

  it('while it is unknown who is here, only join is offered', async () => {
    vi.mocked(me).mockReturnValue(new Promise(() => {}));
    show('/');
    expect(items()).toEqual(['🏠Головна']);
  });

  it('the menu follows sign-in and sign-out without a reload', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/login');
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
    vi.mocked(me).mockResolvedValue(OK);
    fireEvent.click(screen.getByRole('button', { name: 'далі' }));
    expect(await screen.findByRole('link', { name: 'Профіль' })).toBeTruthy();
    vi.mocked(me).mockResolvedValue(OUT);
    fireEvent.click(screen.getByRole('button', { name: 'далі' }));
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
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
      await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
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
      // Вихід (ProfileSettings) забуває відому людину.
      forgetAccount();
      vi.mocked(me).mockResolvedValue(OUT);
      show('/quizzes');
      await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
      expect(getMyInvites).not.toHaveBeenCalled();
    });

    it('counts game invites and group invites together (12k), still five items', async () => {
      const groupInvite = (id: string) => ({ group: { id, name: 'Родина Квіткових', emoji: '🌻' as const, people: 2 }, from: null, at: '2026-11-14T10:00:00.000Z' });
      vi.mocked(me).mockResolvedValue(OK);
      vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [invite('111111')] });
      vi.mocked(getGroupInvites).mockResolvedValue({ ok: true, data: [groupInvite('g1'), groupInvite('g2')] });
      show('/quizzes');
      const link = await screen.findByRole('link', { name: 'Профіль, Запрошень: 3' });
      expect(link.querySelector('.menu-badge')!.textContent).toBe('3');
      expect(items()).toHaveLength(5);
    });

    it('keeps «Профіль» marked on the group pages (12k)', async () => {
      vi.mocked(me).mockResolvedValue(OK);
      for (const path of ['/groups/join/abc', '/profile/groups/x', '/groups']) {
        show(path);
        const link = await screen.findByRole('link', { name: 'Профіль' });
        expect(link.getAttribute('aria-current'), path).toBe('page');
        cleanup();
      }
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

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

describe('the inbox bell (70)', () => {
  it('a signed-in person has a bell to /inbox next to the theme switch; no badge at zero', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/quizzes');
    const bell = await screen.findByRole('link', { name: 'Вхідні' });
    expect(bell.getAttribute('href')).toBe('/inbox');
    expect(bell.classList.contains('menu-inbox')).toBe(true);
    expect(bell.closest('nav')?.getAttribute('aria-label')).toBe('Меню');
    expect(bell.querySelector('.menu-badge')).toBeNull();
    expect(bell.getAttribute('aria-current')).toBeNull();
  });

  it('the unread count shows in the badge and in the name', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    vi.mocked(getInboxBadge).mockResolvedValue({ ok: true, unread: 3 });
    show('/quizzes');
    const bell = await screen.findByRole('link', { name: 'Вхідні, непрочитаних: 3' });
    expect(bell.querySelector('.menu-badge')?.textContent).toBe('3');
    act(() => setInboxUnread(0));
    await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Вхідні' }).querySelector('.menu-badge')).toBeNull());
  });

  it('a big unread count is capped at 99+ in the badge, the name keeps the full number', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    vi.mocked(getInboxBadge).mockResolvedValue({ ok: true, unread: 120 });
    show('/quizzes');
    const bell = await screen.findByRole('link', { name: 'Вхідні, непрочитаних: 120' });
    expect(bell.querySelector('.menu-badge')?.textContent).toBe('99+');
  });

  it('the bell is current on /inbox', async () => {
    vi.mocked(me).mockResolvedValue(OK);
    show('/inbox');
    const bell = await screen.findByRole('link', { name: 'Вхідні' });
    expect(bell.getAttribute('aria-current')).toBe('page');
  });

  it('a visitor has no bell and no inbox request', async () => {
    vi.mocked(me).mockResolvedValue(OUT);
    show('/library');
    await vi.waitFor(() => expect(items()).toEqual(['🏠Головна', '📚Бібліотека', '🔑Увійти']));
    expect(screen.queryByRole('link', { name: 'Вхідні' })).toBeNull();
    expect(getInboxBadge).not.toHaveBeenCalled();
  });
});

describe('menu styles', () => {
  it('on 701–900 px the top bar keeps five full labels on one line each (tighter padding, no wrap)', () => {
    const open = css.indexOf('@media (min-width: 701px) and (max-width: 900px) {');
    expect(open).toBeGreaterThanOrEqual(0);
    const block = css.slice(open, css.indexOf('\n}\n', open));
    const link = block.slice(block.indexOf('.menu a {'), block.indexOf('}', block.indexOf('.menu a {')));
    expect(link).toContain('white-space: nowrap;');
    expect(link).toMatch(/padding-inline: 0\.5rem;/);
    expect(block).toMatch(/\.menu \{[^}]*gap: 0;/);
  });
});
