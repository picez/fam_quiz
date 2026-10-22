// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me } from '../api';
import { WithMenu } from './WithMenu';

vi.mock('../api', () => ({ me: vi.fn() }));

const OK = { ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' } as const;
const OUT = { ok: false, error: 'unauthorized' } as const;

beforeEach(() => {
  vi.mocked(me).mockReset();
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
          <Route path="*" element={<p>сторінка</p>} />
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
  });
});
