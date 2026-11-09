// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { me } from './api';
import { AppRoutes } from './AppRoutes';
import { FeedTabs } from './feed/FeedTabs';

vi.mock('./api', () => ({
  me: vi.fn(),
  getMyInvites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  getFeedBadge: vi.fn().mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 }),
  myPrizes: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  getMyProfile: vi.fn().mockResolvedValue({ ok: true, data: { level: { progress: { level: 1 } } } }),
}));
vi.mock('./trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: () => false }));
vi.mock('./pages/Calendar', () => ({ Calendar: () => <FeedTabs badge={{ events: 0, requests: 0, decisions: 0 }} /> }));
vi.mock('./pages/EditQuiz', () => ({ EditQuiz: () => <p>EditQuiz</p> }));
vi.mock('./pages/Feed', () => ({ Feed: () => <p>Feed</p> }));
vi.mock('./pages/GameHistory', () => ({ GameHistory: () => <p>GameHistory</p> }));
vi.mock('./pages/History', () => ({ History: () => <p>History</p> }));
vi.mock('./pages/HostHelp', () => ({ HostHelp: () => <p>HostHelp</p> }));
vi.mock('./pages/Home', () => ({ Home: () => <p>Home</p> }));
vi.mock('./pages/Host', () => ({ Host: () => <p>Host</p> }));
vi.mock('./pages/Login', () => ({ Login: () => <p>Login</p> }));
vi.mock('./pages/MyGames', () => ({ MyGames: () => <p>MyGames</p> }));
vi.mock('./pages/Play', () => ({ Play: () => <p>Play</p> }));
vi.mock('./pages/Achievements', () => ({ Achievements: () => <p>Achievements</p> }));
vi.mock('./pages/Profile', () => ({ Profile: () => <p>Profile</p> }));
vi.mock('./pages/Prizes', () => ({ Prizes: () => <p>Prizes</p> }));
vi.mock('./pages/Friends', () => ({ Friends: () => <p>Friends</p> }));
vi.mock('./pages/PublicProfile', () => ({ PublicProfile: () => <p>PublicProfile</p> }));
vi.mock('./pages/profile/ProfileQuizzes', () => ({ ProfileQuizzes: () => <p>ProfileQuizzes</p> }));
vi.mock('./pages/profile/ProfileStats', () => ({ ProfileStats: () => <p>ProfileStats</p> }));
vi.mock('./pages/profile/ProfileLikes', () => ({ ProfileLikes: () => <p>ProfileLikes</p> }));
vi.mock('./pages/profile/ProfileLooks', () => ({ ProfileLooks: () => <p>ProfileLooks</p> }));
vi.mock('./pages/profile/ProfileSettings', () => ({ ProfileSettings: () => <p>ProfileSettings</p> }));
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

  it.each(['/', '/login', '/quizzes', '/quizzes/new', '/feed', '/history', '/history/g1', '/me', '/profile', '/help'])('the page %s has the menu', async (path) => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open(path);
    expect(await screen.findByRole('navigation', { name: 'Меню' })).toBeTruthy();
  });

  it.each(['/achievements', '/profile/u2/achievements'])('%s draws the achievements page with the menu', async (path) => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open(path);
    expect(await screen.findByText('Achievements')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Меню' })).toBeTruthy();
  });

  it.each([
    ['/profile/quizzes', 'ProfileQuizzes'],
    ['/profile/prizes', 'Prizes'],
    ['/profile/achievements', 'Achievements'],
    ['/profile/friends', 'Friends'],
    ['/profile/stats', 'ProfileStats'],
    ['/profile/likes', 'ProfileLikes'],
    ['/profile/looks', 'ProfileLooks'],
    ['/profile/settings', 'ProfileSettings'],
    ['/prizes', 'Prizes'],
    ['/friends', 'Friends'],
    ['/profile/u2', 'PublicProfile'],
  ])('%s draws %s with the menu', async (path, page) => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open(path);
    expect(await screen.findByText(page)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Меню' })).toBeTruthy();
  });

  it('/profile/prizes/new opens the prize studio', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
    open('/profile/prizes/new');
    expect(await screen.findByRole('heading', { name: 'Новий приз' })).toBeTruthy();
  });

  it('the reference /help opens without an account', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/help');
    expect(await screen.findByText('HostHelp')).toBeTruthy();
  });

  it('/feed/calendar draws the two tabs with the calendar current and the menu item «Стрічка» active', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
    open('/feed/calendar');
    const calendar = await screen.findByRole('link', { name: 'Календар' });
    expect(calendar.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Події друзів' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Стрічка' }).getAttribute('aria-current')).toBe('page');
  });
});
