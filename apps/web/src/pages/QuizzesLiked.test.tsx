// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLikesGiven, getLikesReceived, getMyProfile, me } from '../api';
import { libraryCatalog } from '../library/library-api';
import { forgetMyProfile } from '../profile/useMyProfile';
import { forgetAccount } from '../useAccount';
import { Library } from './Library';
import { QuizzesLiked } from './QuizzesLiked';

vi.mock('../api', () => ({ me: vi.fn(), getMyProfile: vi.fn(), getLikesGiven: vi.fn(), getLikesReceived: vi.fn() }));
vi.mock('../library/library-api', () => ({ libraryCatalog: vi.fn() }));

const OK = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };

beforeEach(() => {
  forgetAccount();
  forgetMyProfile();
  vi.mocked(me).mockResolvedValue(OK);
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { id: 'u1', likes: { author: 3, host: 1, player: 0 } } as never });
  vi.mocked(getLikesGiven).mockResolvedValue({ ok: true, data: { items: [], next: null } });
  vi.mocked(getLikesReceived).mockResolvedValue({ ok: true, data: { items: [], next: null } });
  vi.mocked(libraryCatalog).mockResolvedValue({ ok: true, data: { items: [], next: null } });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/quizzes/liked" element={<QuizzesLiked />} />
        <Route path="/library" element={<Library />} />
        <Route path="/login" element={<p>вхід</p>} />
      </Routes>
    </MemoryRouter>,
  );

const tabs = () => screen.getByRole('navigation', { name: 'Вікторини' });

describe('«Вікторини» tabs (77)', () => {
  it('/quizzes/liked shows the three tabs with «Вподобані» current, the likes card and the liked lists', async () => {
    open('/quizzes/liked');
    expect(await screen.findByRole('heading', { level: 1, name: 'Вподобані вікторини' })).toBeTruthy();
    const links = [...tabs().querySelectorAll('a')];
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Мої', '/quizzes'],
      ['Бібліотека', '/library'],
      ['Вподобані', '/quizzes/liked'],
    ]);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['Вподобані']);
    expect(await screen.findByRole('tab', { name: 'Мені сподобались' })).toBeTruthy();
    expect(document.querySelector('.likes-card')?.textContent).toContain('3');
  });

  it('a visitor on /quizzes/liked is sent to sign in and back', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    vi.mocked(getMyProfile).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/quizzes/liked');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Fquizzes%2Fliked'));
  });

  it('the library is a tab for an account and stands alone for a visitor', async () => {
    open('/library');
    await screen.findByRole('navigation', { name: 'Вікторини' });
    expect(screen.getByRole('link', { name: 'Бібліотека' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    forgetAccount();
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/library');
    await screen.findByRole('heading', { level: 1, name: 'Бібліотека' });
    await waitFor(() => expect(vi.mocked(me)).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: 'Вікторини' })).toBeNull();
  });
});
