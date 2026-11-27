// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, NavLink, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetTrail } from './nav-trail';
import { RouteEffects } from './RouteEffects';
import { forgetScrolls } from './scroll-memory';
import { useDocumentTitle } from './useDocumentTitle';

let go: NavigateFunction = () => undefined;
function Grab() {
  go = useNavigate();
  return null;
}
function Named() {
  useDocumentTitle('Географія');
  return <main><h1>Географія</h1></main>;
}
function Tabs() {
  return (
    <nav>
      <NavLink to="/history" end>Проведені</NavLink>
      <NavLink to="/me" end>Зіграні</NavLink>
    </nav>
  );
}

function app(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Grab />
      <RouteEffects />
      <nav className="menu">
        <Link to="/profile/friends">Друзі</Link>
      </nav>
      <Routes>
        <Route path="/library/:id" element={<Named />} />
        <Route path="/login" element={<main><h1>Вхід</h1><input aria-label="Пошта" autoFocus /></main>} />
        <Route path="/history" element={<main><Tabs /><h1>Історія ігор</h1></main>} />
        <Route path="/me" element={<main><Tabs /><h1>Мої ігри</h1></main>} />
        <Route path="/host/:code" element={<main><h1>Пульт</h1></main>} />
        <Route path="*" element={<main><h1>Сторінка</h1></main>} />
      </Routes>
    </MemoryRouter>,
  );
}

const scrollTo = vi.fn();
beforeEach(() => {
  forgetTrail();
  forgetScrolls();
  scrollTo.mockReset();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});
afterEach(cleanup);

describe('RouteEffects: tab title (76)', () => {
  it('names the tab after the page', async () => {
    app('/');
    expect(document.title).toBe('Вікторина');
    await act(async () => go('/profile/friends'));
    expect(document.title).toBe('Друзі · Вікторина');
    await act(async () => go('/host/123456'));
    expect(document.title).toBe('Вікторина');
  });

  it('lets a page refine the title with its own name', async () => {
    app('/');
    await act(async () => go('/library/q1'));
    expect(document.title).toBe('Географія · Вікторина');
  });
});

describe('RouteEffects: scroll and focus (76)', () => {
  it('leaves focus alone on the first open', () => {
    app('/');
    expect(document.activeElement).toBe(document.body);
  });

  it('a new page opens at the top with focus on its heading', async () => {
    app('/');
    screen.getByRole('link', { name: 'Друзі' }).focus();
    await act(async () => screen.getByRole('link', { name: 'Друзі' }).click());
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Сторінка' }));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });

  it('a query-only change neither scrolls nor moves focus', async () => {
    app('/library');
    const menu = screen.getByRole('link', { name: 'Друзі' });
    menu.focus();
    await act(async () => go('/library?q=ліс', { replace: true }));
    await act(async () => go('/library?q=ліси'));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(menu);
  });

  it('keeps the focus a page put into its own field', async () => {
    app('/');
    await act(async () => go('/login'));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Пошта' }));
  });

  it('switching tabs of one page focuses the active tab, not the heading', async () => {
    app('/history');
    await act(async () => screen.getByRole('link', { name: 'Зіграні' }).click());
    expect(screen.getByRole('heading', { name: 'Мої ігри' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Зіграні' }));
  });

  it('back restores the remembered scroll', async () => {
    app('/');
    await act(async () => go('/quizzes'));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
    await act(async () => go('/help'));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    scrollTo.mockReset();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
    await act(async () => go(-1));
    expect(scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: 'instant' });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 0 });
  });

  it('game screens are left alone', async () => {
    app('/');
    await act(async () => go('/host/123456'));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});
