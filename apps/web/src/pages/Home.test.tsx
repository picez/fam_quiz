// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCode, getFeedBadge, getMyInvites, listLobbies, me } from '../api';
import { savePlayer } from '../storage';
import { ACCOUNT_WAIT_MS, Home } from './Home';

vi.mock('../api', () => ({ checkCode: vi.fn(), me: vi.fn(), getMyInvites: vi.fn(), getFeedBadge: vi.fn(), createGame: vi.fn(), createQuiz: vi.fn(), listLobbies: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
});
afterEach(cleanup);

async function enter(code: string) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play/:code" element={<p>сторінка гри</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(await screen.findByLabelText('Код гри'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
}

const STARTED = 'Ця гра вже почалася, приєднатися до неї не можна. Попросіть того, хто її запустив, створити нову.';

describe('Home', () => {
  it('shows a guest the code form even when the account check hangs', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(me).mockReturnValue(new Promise(() => {}));
      render(
        <MemoryRouter initialEntries={['/']}>
          <Home />
        </MemoryRouter>,
      );
      expect(screen.queryByLabelText('Код гри')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(ACCOUNT_WAIT_MS);
      });
      expect(screen.getByLabelText('Код гри')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the game page when the game is waiting in the lobby', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'lobby', title: 'Гра', locked: false, late: false });
    await enter('123 456');
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
    expect(checkCode).toHaveBeenCalledWith('123456');
  });

  it('explains that a game which has started cannot be joined', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Гра', locked: false, late: false });
    await enter('123456');
    expect((await screen.findByRole('alert')).textContent).toBe(STARTED);
    expect(screen.queryByText('сторінка гри')).toBeNull();
  });

  it('lets a returning player back into a game that has started', async () => {
    savePlayer('123456', 'saved-token');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Гра', locked: false, late: false });
    await enter('123456');
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
  });

  it('shows a guest the open games under the code field', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>,
    );
    const field = await screen.findByLabelText('Код гри');
    const heading = await screen.findByRole('heading', { name: 'Відкриті ігри' });
    expect(field.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(listLobbies).toHaveBeenCalled();
  });

  it('opens a continued game that is already running without a saved player', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Гра', locked: false, late: true });
    await enter('123456');
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
  });

  it('explains an unknown code', async () => {
    vi.mocked(checkCode).mockResolvedValue({ ok: false, error: 'game_not_found' });
    await enter('123456');
    expect((await screen.findByRole('alert')).textContent).toBe('Гру з таким кодом не знайдено. Перевірте код.');
  });
});

describe('Home for a signed-in person', () => {
  const OLENA = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play/:code" element={<p>сторінка гри</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it('shows seven start tiles in order and no code form until «Доєднатись до гри» is pressed', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    at('/');
    const nav = await screen.findByRole('navigation', { name: 'Стартове меню' });
    const tiles = [...nav.children].map((tile) => [tile.tagName, tile.textContent, tile.getAttribute('href')]);
    expect(tiles).toEqual([
      ['A', '🎬Створити гру', '/create'],
      ['BUTTON', '🎮Доєднатись до гри', null],
      ['A', '👥Друзі', '/profile/friends'],
      ['A', '📰Стрічка', '/feed'],
      ['A', '📝Мої вікторини', '/quizzes'],
      ['A', '🕘Історія', '/history'],
      ['A', '👤Профіль', '/profile'],
    ]);
    expect(screen.queryByLabelText('Код гри')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Я ведучий' })).toBeNull();

    const join = screen.getByRole('button', { name: 'Доєднатись до гри' });
    expect(join.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(join);
    expect(join.getAttribute('aria-expanded')).toBe('true');
    const input = screen.getByLabelText('Код гри');
    expect(document.activeElement).toBe(input);

    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'lobby', title: 'Гра', locked: false, late: false });
    fireEvent.change(input, { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
  });

  it('marks new feed events and invites on their tiles, like the menu', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 2, requests: 1, decisions: 0 });
    vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [{ code: '111111' }, { code: '222222' }] as never });
    at('/');
    const feed = await screen.findByRole('link', { name: 'Стрічка, Нових подій: 3' });
    expect(feed.querySelector('.start-badge')?.textContent).toBe('3');
    const profile = await screen.findByRole('link', { name: 'Профіль, Запрошень: 2' });
    expect(profile.querySelector('.start-badge')?.textContent).toBe('2');
    expect(screen.getByRole('link', { name: 'Друзі' }).querySelector('.start-badge')).toBeNull();
  });

  it('opens the code form at once with the code from ?code=', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    at('/?code=123456');
    expect(((await screen.findByLabelText('Код гри')) as HTMLInputElement).value).toBe('123456');
    expect(screen.getByRole('button', { name: 'Доєднатись до гри' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the plain entry for a visitor', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByRole('link', { name: 'Я ведучий' })).getAttribute('href')).toBe('/quizzes');
    expect(screen.queryByRole('link', { name: 'Мої ігри' })).toBeNull();
  });

  it('sets the title and the code field over a decorative moon and crows', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    const hero = container.querySelector('.motif-hero')!;
    expect(hero).not.toBeNull();
    expect(hero.querySelector('.moon')?.getAttribute('aria-hidden')).toBe('true');
    expect(hero.querySelector('svg.crows')?.getAttribute('aria-hidden')).toBe('true');
    expect(hero.contains(screen.getByRole('heading', { level: 1 }))).toBe(true);
    expect(hero.contains(await screen.findByLabelText('Код гри'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Увійти' })).toBeTruthy();
  });
});
