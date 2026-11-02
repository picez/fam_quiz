// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FeedEvent } from '@quiz/shared';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeed, getFeedBadge, likeFeedEvent, markFeedSeen, me } from '../api';
import { FEED_CHANGED } from '../useFeedBadge';
import { Feed } from './Feed';

vi.mock('../api', () => ({ me: vi.fn(), getFeed: vi.fn(), getFeedBadge: vi.fn(), markFeedSeen: vi.fn(), likeFeedEvent: vi.fn() }));

const ev = (id: string, over: Partial<FeedEvent> = {}): FeedEvent => ({
  id,
  at: '2026-11-01T10:00:00.000Z',
  who: { id: 'p', nickname: 'Петро', avatar: null },
  mine: false,
  data: { kind: 'game', title: `Гра ${id}`, place: 2, of: 5, team: null },
  likes: { count: 2, liked: false },
  ...over,
});

const show = () =>
  render(
    <MemoryRouter initialEntries={['/feed']}>
      <Feed />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
  vi.mocked(markFeedSeen).mockResolvedValue({ ok: true });
  vi.mocked(getFeed).mockResolvedValue({ ok: true, events: [ev('e1')], next: null, asOf: '2026-11-02T10:00:00.000Z' });
});
afterEach(cleanup);

describe('Feed', () => {
  it('marks the first page seen and announces it', async () => {
    const changed = vi.fn();
    window.addEventListener(FEED_CHANGED, changed);
    show();
    await screen.findByText(/Гра e1/);
    await waitFor(() => expect(markFeedSeen).toHaveBeenCalledWith('2026-11-02T10:00:00.000Z'));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    window.removeEventListener(FEED_CHANGED, changed);
    const tab = screen.getByRole('link', { name: 'Події друзів' });
    expect(tab.getAttribute('aria-current')).toBe('page');
  });

  it('pages with «Показати ще» until next is null, without repeats', async () => {
    vi.mocked(getFeed).mockResolvedValueOnce({ ok: true, events: [ev('e1')], next: 'c1', asOf: 'x' });
    vi.mocked(getFeed).mockResolvedValueOnce({ ok: true, events: [ev('e1'), ev('e2')], next: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Показати ще' }));
    await screen.findByText(/Гра e2/);
    expect(getFeed).toHaveBeenLastCalledWith('c1');
    expect(screen.getAllByText(/Гра e1/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
  });

  it('hearts: the server answer sets state; a refusal rolls back and shows the text', async () => {
    vi.mocked(likeFeedEvent).mockResolvedValueOnce({ ok: true, liked: true, likes: 3 });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Вподобати подію' }));
    const pressed = await screen.findByRole('button', { name: 'Прибрати вподобання' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(pressed.textContent).toContain('3');
    expect(likeFeedEvent).toHaveBeenCalledWith('e1', true);

    vi.mocked(likeFeedEvent).mockResolvedValueOnce({ ok: false, error: 'like_rate' });
    fireEvent.click(pressed);
    expect(await screen.findByRole('alert')).toBeTruthy();
    const back = screen.getByRole('button', { name: 'Прибрати вподобання' });
    expect(back.getAttribute('aria-pressed')).toBe('true');
    expect(back.textContent).toContain('3');
  });

  it('re-navigating to /feed refetches and marks the new asOf seen', async () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <Link to="/feed">again</Link>
        <Feed />
      </MemoryRouter>,
    );
    await screen.findByText(/Гра e1/);
    await waitFor(() => expect(markFeedSeen).toHaveBeenCalledTimes(1));
    vi.mocked(getFeed).mockResolvedValue({ ok: true, events: [ev('e9')], next: null, asOf: '2026-11-03T10:00:00.000Z' });
    fireEvent.click(screen.getByRole('link', { name: 'again' }));
    await screen.findByText(/Гра e9/);
    await waitFor(() => expect(markFeedSeen).toHaveBeenLastCalledWith('2026-11-03T10:00:00.000Z'));
    expect(getFeed).toHaveBeenCalledTimes(2);
  });

  it('a failed first load shows the text and a retry button', async () => {
    vi.mocked(getFeed).mockResolvedValueOnce({ ok: false, error: 'network' });
    show();
    expect(await screen.findByText('Не вдалося завантажити стрічку')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще' }));
    await screen.findByText(/Гра e1/);
    expect(getFeed).toHaveBeenCalledTimes(2);
  });

  it('a «Показати ще» failure shows the error right above the button', async () => {
    vi.mocked(getFeed).mockResolvedValueOnce({ ok: true, events: [ev('e1')], next: 'c1', asOf: 'x' });
    vi.mocked(getFeed).mockResolvedValueOnce({ ok: false, error: 'network' });
    show();
    const more = await screen.findByRole('button', { name: 'Показати ще' });
    fireEvent.click(more);
    const alert = await screen.findByRole('alert');
    expect(alert.nextElementSibling).toBe(screen.getByRole('button', { name: 'Показати ще' }));
  });

  it('an empty feed explains how to add friends', async () => {
    vi.mocked(getFeed).mockResolvedValue({ ok: true, events: [], next: null, asOf: 'x' });
    show();
    expect(await screen.findByText(/Друзі — це ті/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'До друзів у профілі' }).getAttribute('href')).toBe('/profile');
  });
});
