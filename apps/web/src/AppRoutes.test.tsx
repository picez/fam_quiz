// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { me } from './api';
import { AppRoutes } from './AppRoutes';

vi.mock('./api', () => ({ me: vi.fn() }));
vi.mock('./pages/EditQuiz', () => ({ EditQuiz: () => <p>EditQuiz</p> }));
vi.mock('./pages/GameHistory', () => ({ GameHistory: () => <p>GameHistory</p> }));
vi.mock('./pages/History', () => ({ History: () => <p>History</p> }));
vi.mock('./pages/Home', () => ({ Home: () => <p>Home</p> }));
vi.mock('./pages/Host', () => ({ Host: () => <p>Host</p> }));
vi.mock('./pages/Login', () => ({ Login: () => <p>Login</p> }));
vi.mock('./pages/MyGames', () => ({ MyGames: () => <p>MyGames</p> }));
vi.mock('./pages/Play', () => ({ Play: () => <p>Play</p> }));
vi.mock('./pages/Quizzes', () => ({ Quizzes: () => <p>Quizzes</p> }));
vi.mock('./pages/Stage', () => ({ Stage: () => <p>Stage</p> }));

afterEach(cleanup);

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('AppRoutes', () => {
  it.each([
    ['/play/123456', 'Play'],
    ['/host/123456', 'Host'],
    ['/stage/123456', 'Stage'],
  ])('a game screen %s has no menu', async (path, page) => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open(path);
    await screen.findByText(page);
    expect(screen.queryByRole('navigation', { name: 'Меню' })).toBeNull();
  });

  it.each(['/', '/login', '/quizzes', '/quizzes/new', '/history', '/history/g1', '/me', '/profile'])('the page %s has the menu', async (path) => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open(path);
    expect(await screen.findByRole('navigation', { name: 'Меню' })).toBeTruthy();
  });
});
