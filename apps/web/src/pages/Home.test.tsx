// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { checkCode, continueGame, getCalendar, getFeedBadge, getMyInvites, listFriendChallenges, listGames, listLobbies, me } from '../api';
import { saveHost, saveLastGame, savePlayer } from '../storage';
import { dayHeading, timeText, viewerZone } from '../calendar/calendar-time';
import type { CalendarEvent, GameSummary } from '@quiz/shared';
import { forgetRunningGame } from '../host-game';
import { ACCOUNT_WAIT_MS, Home } from './Home';

vi.mock('../api', () => ({ checkCode: vi.fn(), me: vi.fn(), getMyInvites: vi.fn(), getGroupInvites: vi.fn(async () => ({ ok: true, data: [] })), getFeedBadge: vi.fn(), createGame: vi.fn(), createQuiz: vi.fn(), listLobbies: vi.fn(), listGames: vi.fn(), getCalendar: vi.fn(), continueGame: vi.fn(), listFriendChallenges: vi.fn() }));

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
  vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getFeedBadge).mockResolvedValue({ ok: true, events: 0, requests: 0, decisions: 0 });
  vi.mocked(listGames).mockReset().mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getCalendar).mockReset().mockResolvedValue({ ok: true, events: [], asOf: new Date().toISOString() });
  vi.mocked(continueGame).mockReset();
  vi.mocked(listFriendChallenges).mockReset().mockResolvedValue({ ok: true, data: [] });
  vi.mocked(checkCode).mockReset();
  forgetRunningGame();
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

  it('64: a guest sees «Повідомити про проблему» linking to /report from the home page', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: 'Повідомити про проблему' });
    expect(link.getAttribute('href')).toBe('/report?from=%2F');
    expect(link.getAttribute('target')).toBeNull();
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

  it('a signed-in person sees «Провести гру» and «Приєднатися» on top and six tiles below', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    at('/');
    const nav = await screen.findByRole('navigation', { name: 'Стартове меню' });
    const tiles = [...nav.children].map((tile) => [tile.tagName, tile.textContent, tile.getAttribute('href')]);
    expect(tiles).toEqual([
      ['A', '👥Друзі', '/profile/friends'],
      ['A', '📰Стрічка', '/feed'],
      ['A', '📝Вікторини', '/quizzes'],
      ['A', '📚Бібліотека', '/library'],
      ['A', '🕘Історія', '/history'],
      ['A', '👤Профіль', '/profile'],
    ]);
    const create = screen.getByRole('link', { name: 'Провести гру' });
    expect(create.getAttribute('href')).toBe('/create');
    const join = screen.getByRole('button', { name: 'Приєднатися' });
    const actions = create.closest('.home-actions')!;
    expect(actions).not.toBeNull();
    expect(actions.contains(join)).toBe(true);
    expect(actions.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText('Код гри')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Я ведучий' })).toBeNull();
    // 64: посилання на скаргу — під плитками, не серед них.
    const report = screen.getByRole('link', { name: 'Повідомити про проблему' });
    expect(report.getAttribute('href')).toBe('/report?from=%2F');
    expect(nav.contains(report)).toBe(false);
  });

  it('«Приєднатися» opens the code form under the buttons', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    at('/');
    const join = await screen.findByRole('button', { name: 'Приєднатися' });
    expect(join.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(join);
    expect(join.getAttribute('aria-expanded')).toBe('true');
    expect(join.getAttribute('aria-controls')).toBe('join-form');
    const input = screen.getByLabelText('Код гри');
    expect(document.activeElement).toBe(input);
    expect(join.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.compareDocumentPosition(screen.getByRole('navigation', { name: 'Стартове меню' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'lobby', title: 'Гра', locked: false, late: false });
    fireEvent.change(input, { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('сторінка гри')).toBeTruthy();
  });

  it('opens the code form at once with the code from ?code=', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    at('/?code=123456');
    expect(((await screen.findByLabelText('Код гри')) as HTMLInputElement).value).toBe('123456');
    expect(screen.getByRole('button', { name: 'Приєднатися' }).getAttribute('aria-expanded')).toBe('true');
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
    const library = screen.getByRole('link', { name: '📚 Бібліотека вікторин' });
    expect(library.getAttribute('href')).toBe('/library');
    expect(library.className).toContain('quiet-link');
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

  const routes = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host/:code" element={<p>пульт ведучого</p>} />
          <Route path="/play/:code" element={<p>сторінка гри</p>} />
        </Routes>
      </MemoryRouter>,
    );
  const SAVED: GameSummary = {
    id: 'g7',
    title: 'Осінній квіз',
    code: '111111',
    status: 'saved',
    startedAt: '2026-11-01T18:00:00.000Z',
    finishedAt: null,
    playerCount: 4,
    questionsPlayed: 5,
    questionCount: 20,
    teams: false,
    autopilot: false,
    saved: { mode: 'exact', open: false, openCode: null, savedAt: '2026-11-10T10:00:00.000Z' },
  };
  const EVENT: CalendarEvent = {
    id: 'e1',
    title: 'Вечір загадок',
    startsAt: new Date(Date.now() + 26 * 3_600_000).toISOString(),
    host: { id: 'h1', nickname: 'Оксана', avatar: null },
    mine: false,
    quiz: { id: null, title: 'Загадки' },
    state: 'open',
    editedAt: null,
    cancelledAt: null,
    approved: 3,
    myRequest: 'approved',
    requests: null,
    joinCode: '222222',
  };

  it('a guest gets both buttons with the form already open', async () => {
    at('/');
    const input = await screen.findByLabelText('Код гри');
    const join = screen.getByRole('button', { name: 'Приєднатися' });
    expect(join.getAttribute('aria-expanded')).toBe('true');
    expect(join.getAttribute('aria-controls')).toBe('join-form');
    expect(screen.getByRole('link', { name: 'Провести гру' }).getAttribute('href')).toBe('/create');
    expect(join.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Стартове меню' })).toBeNull();
  });

  it('«Продовжити гру» for a running game links back to the host panel and replaces the old banner', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    saveHost('654321', { hostToken: 'h', stageToken: 's' });
    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Географія', locked: false, late: false });
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [SAVED] });
    vi.mocked(getCalendar).mockResolvedValue({ ok: true, events: [EVENT], asOf: new Date().toISOString() });
    routes('/');
    const card = (await screen.findByRole('heading', { name: 'Продовжити гру' })).closest('.next-up') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.className).toContain('panel');
    expect(card.textContent).toContain('Географія');
    expect(card.textContent).toContain('Гра 654 321 ще триває');
    expect(screen.getByRole('link', { name: 'Повернутися' }).getAttribute('href')).toBe('/host/654321');
    expect(screen.queryByRole('link', { name: /Повернутися до гри/ })).toBeNull();
    expect(screen.queryByText('Осінній квіз')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Найближча подія' })).toBeNull();
  });

  it('«Продовжити гру» for a saved game continues it', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [SAVED] });
    vi.mocked(getCalendar).mockResolvedValue({ ok: true, events: [EVENT], asOf: new Date().toISOString() });
    vi.mocked(continueGame).mockResolvedValue({ ok: true, gameId: 'g8', code: '333444', hostToken: 'h', stageToken: 's' });
    routes('/');
    const card = (await screen.findByRole('heading', { name: 'Продовжити гру' })).closest('.next-up') as HTMLElement;
    expect(card.textContent).toContain('Осінній квіз');
    expect(card.textContent).toContain('Збережено ');
    fireEvent.click(screen.getByRole('button', { name: 'Продовжити' }));
    expect(await screen.findByText('пульт ведучого')).toBeTruthy();
    expect(continueGame).toHaveBeenCalledWith('g7');
  });

  it('shows why a saved game could not be continued', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [SAVED] });
    vi.mocked(continueGame).mockResolvedValue({ ok: false, error: 'offline' });
    routes('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Продовжити' }));
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
  });

  it('«Найближча подія» shows the title, day and time and links to the calendar', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(getCalendar).mockResolvedValue({ ok: true, events: [EVENT], asOf: new Date().toISOString() });
    routes('/');
    const card = (await screen.findByRole('heading', { name: 'Найближча подія' })).closest('.next-up') as HTMLElement;
    const zone = viewerZone();
    expect(card.textContent).toContain('Вечір загадок');
    expect(card.textContent).toContain(`${dayHeading(EVENT.startsAt, zone)}, ${timeText(EVENT.startsAt, zone)}`);
    expect(card.textContent).toContain('Веде Оксана');
    expect(card.textContent).toContain('Гра вже відкрита');
    expect(screen.getByRole('link', { name: 'До календаря' }).getAttribute('href')).toBe('/feed/calendar');
  });

  it('no card while the answers are pending and none when there is nothing', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(getCalendar).mockResolvedValue({ ok: true, events: [EVENT], asOf: new Date().toISOString() });
    let answer: (value: Awaited<ReturnType<typeof listGames>>) => void = () => {};
    vi.mocked(listGames).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    routes('/');
    await screen.findByRole('navigation', { name: 'Стартове меню' });
    await act(async () => {});
    expect(getCalendar).toHaveBeenCalled();
    expect(document.querySelector('.next-up')).toBeNull();
    await act(async () => answer({ ok: false, error: 'offline' }));
    expect(await screen.findByRole('heading', { name: 'Найближча подія' })).toBeTruthy();
    cleanup();

    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(getCalendar).mockResolvedValue({ ok: false, error: 'offline' });
    routes('/');
    await screen.findByRole('navigation', { name: 'Стартове меню' });
    await act(async () => {});
    expect(listGames).toHaveBeenCalled();
    expect(document.querySelector('.next-up')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sign-in that resolves after the guest wait asks for the running game only once', async () => {
    vi.useFakeTimers();
    try {
      saveHost('654321', { hostToken: 'h', stageToken: 's' });
      saveLastGame('654321');
      vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Географія', locked: false, late: false });
      let signIn: (value: Awaited<ReturnType<typeof me>>) => void = () => {};
      vi.mocked(me).mockReturnValue(new Promise((resolve) => (signIn = resolve)));
      routes('/');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACCOUNT_WAIT_MS);
      });
      expect(checkCode).toHaveBeenCalledTimes(1);
      await act(async () => {
        signIn(OLENA);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('navigation', { name: 'Стартове меню' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Повернутися' }).getAttribute('href')).toBe('/host/654321');
      expect(checkCode).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('78: an invite comes before the calendar and joins the game', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(getMyInvites).mockResolvedValue({ ok: true, data: [{ code: '777888', title: 'Новорічна', host: { id: 'h2', nickname: 'Петро', avatar: null }, invitedAt: new Date().toISOString() }] });
    vi.mocked(getCalendar).mockResolvedValue({ ok: true, events: [EVENT], asOf: new Date().toISOString() });
    routes('/');
    const card = (await screen.findByRole('heading', { name: 'Тебе запросили в гру' })).closest('.next-up') as HTMLElement;
    expect(card.textContent).toContain('Новорічна');
    expect(card.textContent).toContain('Петро запрошує тебе · код 777 888');
    expect(within(card).getByRole('link', { name: 'Приєднатися' }).getAttribute('href')).toBe('/play/777888');
    expect(screen.queryByRole('heading', { name: 'Найближча подія' })).toBeNull();
  });

  it('78: with nothing else, a challenge from a friend opens its page', async () => {
    vi.mocked(me).mockResolvedValue(OLENA);
    vi.mocked(listFriendChallenges).mockResolvedValue({ ok: true, data: [{ code: 'abcdefghjkmn', title: 'Столиці', author: { id: 'a1', nickname: 'Ірина' }, expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }] });
    routes('/');
    const card = (await screen.findByRole('heading', { name: 'Виклик від друга' })).closest('.next-up') as HTMLElement;
    expect(card.textContent).toContain('Столиці');
    expect(card.textContent).toContain('від Ірина');
    expect(within(card).getByRole('link', { name: 'Прийняти виклик' }).getAttribute('href')).toBe('/challenge/abcdefghjkmn');
  });

  it('a guest never asks for saved games or the calendar', async () => {
    saveHost('654321', { hostToken: 'h', stageToken: 's' });
    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Географія', locked: false, late: false });
    routes('/');
    expect(await screen.findByRole('heading', { name: 'Продовжити гру' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Повернутися' }).getAttribute('href')).toBe('/host/654321');
    expect(listGames).not.toHaveBeenCalled();
    expect(getCalendar).not.toHaveBeenCalled();
    expect(listFriendChallenges).not.toHaveBeenCalled();
  });
});
