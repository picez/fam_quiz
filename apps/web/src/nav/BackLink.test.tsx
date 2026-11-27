// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSubpage } from '../profile/ProfileSubpage';
import { BackLink } from './BackLink';
import { forgetTrail } from './nav-trail';
import { RouteEffects } from './RouteEffects';

let go: NavigateFunction = () => undefined;
function Grab() {
  go = useNavigate();
  return null;
}
function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
}

function app(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Grab />
      <RouteEffects />
      <Where />
      <Routes>
        <Route path="/profile/friends" element={<ProfileSubpage title="Друзі">список</ProfileSubpage>} />
        <Route path="/inbox" element={<main><BackLink parent="/" /><h1>Вхідні</h1></main>} />
        <Route path="*" element={<main><h1>Інша</h1></main>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  forgetTrail();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(cleanup);

describe('BackLink (76)', () => {
  it('a deep link goes to the parent page, named with a word', () => {
    app(['/profile/friends']);
    const back = screen.getByRole('link', { name: 'Назад: Профіль' });
    expect(back.getAttribute('href')).toBe('/profile');
    expect(back.textContent).toBe('‹ Профіль');
  });

  it('coming from inside the site goes back there, with its name', async () => {
    app(['/']);
    await act(async () => go('/profile/friends'));
    const back = screen.getByRole('link', { name: 'Назад: Головна' });
    expect(back.getAttribute('href')).toBe('/');
    await act(async () => back.click());
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('steps back over query-only changes to the page it came from', async () => {
    app(['/quizzes?sort=title']);
    await act(async () => go('/inbox'));
    await act(async () => go('/inbox?page=2'));
    const back = screen.getByRole('link', { name: 'Назад: Мої вікторини' });
    await act(async () => back.click());
    expect(screen.getByTestId('where').textContent).toBe('/quizzes?sort=title');
  });

  it('the sign-in page and game screens do not count as where one came from', async () => {
    app(['/login?next=%2Finbox']);
    await act(async () => go('/inbox'));
    expect(screen.getByRole('link', { name: 'Назад: Головна' }).getAttribute('href')).toBe('/');
    await act(async () => go('/play/123456'));
    await act(async () => go('/inbox'));
    expect(screen.getByRole('link', { name: 'Назад: Головна' }).getAttribute('href')).toBe('/');
  });
});
