// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyCard, joinGame, me } from '../api';
import { loadAuthor, loadPlayer, saveAuthor, savePlayer } from '../storage';
import { Play } from './Play';

const { sockets, FakeSocket } = vi.hoisted(() => {
  /** Підставний сокет: тест сам вирішує, які події прийшли із сервера. */
  class FakeSocket {
    connected = true;
    active = true;
    connect() {}
    private handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit() {}
    close() {}
    fire(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }
  return { sockets: [] as FakeSocket[], FakeSocket };
});

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  },
}));
vi.mock('../api', () => ({ joinGame: vi.fn(), me: vi.fn(), getMyCard: vi.fn() }));
vi.mock('../screens/PlayerScreen', () => ({ PlayerScreen: () => <p>screen</p> }));

beforeEach(() => {
  localStorage.clear();
  sockets.length = 0;
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
  vi.mocked(getMyCard).mockReset().mockResolvedValue({ ok: false, error: 'unauthorized' });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/play/123456']}>
      <Routes>
        <Route path="/play/:code" element={<Play />} />
      </Routes>
    </MemoryRouter>,
  );

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));

function submitNickname(name: string) {
  fireEvent.change(screen.getByLabelText('Ваше ім’я'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Увійти в гру' }));
}

describe('Play', () => {
  it('keeps the token and shows «Сервер перезапускається…» instead of «гри немає»', async () => {
    savePlayer('123456', 'kept-token');
    open();
    act(() => sockets[0].fire('connect_error', new Error('restarting')));
    expect(screen.getByText('Сервер перезапускається… Гра продовжиться сама.')).toBeTruthy();
    expect(loadPlayer('123456')).toBe('kept-token');
    expect(screen.queryByText(/Цієї гри вже немає/)).toBeNull();
  });

  it('lets a kicked player join again without reloading the page', async () => {
    savePlayer('123456', 'old-token');
    vi.mocked(joinGame).mockResolvedValue({ ok: true, token: 'fresh-token', playerId: 'p9' });
    open();
    act(() => sockets[0].fire('closed', 'kicked'));
    expect(await screen.findByText('Ведучий вилучив вас із гри.')).toBeTruthy();
    expect(loadPlayer('123456')).toBeNull();

    submitNickname('Чемний');
    await settle();

    expect(loadPlayer('123456')).toBe('fresh-token');
    expect(screen.queryByLabelText('Ваше ім’я')).toBeNull();
    expect(screen.getByText('Підключаємося…')).toBeTruthy();
    expect(joinGame).toHaveBeenCalledTimes(1);
  });

  it('a player removed from a game with no host is told the author did it; in a hosted game, the host', async () => {
    savePlayer('123456', 'old-token');
    open();
    act(() => sockets[0].fire('state', { role: 'player', autopilot: true, paused: false, questionIndex: -1, splash: null }, { serverNow: Date.now(), hostOnline: true, stageOnline: true }));
    act(() => sockets[0].fire('closed', 'kicked'));
    expect(await screen.findByText('Автор гри вилучив вас із гри.')).toBeTruthy();
    cleanup();
    sockets.length = 0;
    savePlayer('123456', 'old-token');
    open();
    act(() => sockets[0].fire('state', { role: 'player', autopilot: false, paused: false, questionIndex: -1, splash: null }, { serverNow: Date.now(), hostOnline: true, stageOnline: true }));
    act(() => sockets[0].fire('closed', 'kicked'));
    expect(await screen.findByText('Ведучий вилучив вас із гри.')).toBeTruthy();
  });

  it('a game with no host that is gone says so without a host and forgets the author key with the token', async () => {
    savePlayer('123456', 'old-token');
    saveAuthor('123456', { stageToken: 's' });
    open();
    act(() => sockets[0].fire('state', { role: 'player', autopilot: true, paused: false, questionIndex: -1, splash: null }, { serverNow: Date.now(), hostOnline: true, stageOnline: true }));
    act(() => sockets[0].fire('closed', 'ended'));
    expect(await screen.findByText('Цієї гри вже немає. Перевірте код або попросіть автора гри створити нову.')).toBeTruthy();
    expect(loadPlayer('123456')).toBeNull();
    expect(loadAuthor('123456')).toBeNull();
  });

  it('a hosted game that is gone still names the host', async () => {
    savePlayer('123456', 'old-token');
    open();
    act(() => sockets[0].fire('connect_error', new Error('unauthorized')));
    expect(await screen.findByText('Цієї гри вже немає. Перевірте код або попросіть ведучого створити нову.')).toBeTruthy();
  });

  it('lets a player with a token that no longer works join again', async () => {
    savePlayer('123456', 'stale-token');
    vi.mocked(joinGame).mockResolvedValue({ ok: true, token: 'fresh-token', playerId: 'p9' });
    open();
    act(() => sockets[0].fire('connect_error', new Error('unauthorized')));
    await screen.findByLabelText('Ваше ім’я');

    submitNickname('Олена');
    await settle();

    expect(loadPlayer('123456')).toBe('fresh-token');
    expect(screen.queryByLabelText('Ваше ім’я')).toBeNull();
  });

  it('explains that a game which has started cannot be joined', async () => {
    vi.mocked(joinGame).mockResolvedValue({ ok: false, error: 'wrong_phase' });
    open();
    submitNickname('Олена');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ця гра вже почалася, приєднатися до неї не можна. Попросіть того, хто її запустив, створити нову.',
    );
  });
});

describe('Play: whether the game will be kept', () => {
  it('offers a visitor to sign in without losing the game code', async () => {
    open();
    const link = await screen.findByRole('link', { name: 'Увійти, щоб гра збереглась у «Мої ігри»' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fplay%2F123456');
  });

  it('tells a signed-in player that the game will be kept', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
    open();
    expect(await screen.findByText('Ви увійшли як Олена: гра потрапить у «Мої ігри».')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Увійти, щоб гра збереглась/ })).toBeNull();
  });

  it('fills the name from the profile nickname for a signed-in player, who can still change it (backlog 4)', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена Петренко', email: 'o@example.com' });
    vi.mocked(getMyCard).mockResolvedValue({ ok: true, data: { id: 'u1', nickname: 'Оленка', avatar: null } });
    vi.mocked(joinGame).mockResolvedValue({ ok: true, token: 'fresh-token', playerId: 'p9' });
    open();
    const field = screen.getByLabelText<HTMLInputElement>('Ваше ім’я');
    await waitFor(() => expect(field.value).toBe('Оленка'));
    submitNickname('Оля');
    await waitFor(() => expect(joinGame).toHaveBeenCalledWith('123456', 'Оля'));
  });

  it('leaves the name empty for a visitor and asks no profile', async () => {
    open();
    await screen.findByRole('link', { name: 'Увійти, щоб гра збереглась у «Мої ігри»' });
    expect(screen.getByLabelText<HTMLInputElement>('Ваше ім’я').value).toBe('');
    expect(getMyCard).not.toHaveBeenCalled();
  });
});

describe('Play: when the session check fails', () => {
  it('makes no claim about whether the game will be kept', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unknown' });
    open();
    await screen.findByLabelText('Ваше ім’я');
    await settle();
    expect(screen.queryByRole('link', { name: /Увійти, щоб гра збереглась/ })).toBeNull();
    expect(screen.queryByText(/гра потрапить у «Мої ігри»/)).toBeNull();
  });
});

describe('Play: the phone tells the server when it leaves the game (12e)', () => {
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  it('sends player:away when the page is hidden during a question', () => {
    savePlayer('123456', 'kept-token');
    open();
    const emit = vi.spyOn(sockets[0], 'emit');
    act(() => sockets[0].fire('state', { role: 'player', phase: 'question', autopilot: false, paused: false, questionIndex: 0, splash: null }, { serverNow: Date.now(), hostOnline: true, stageOnline: true }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(emit).toHaveBeenCalledWith('player:away', { away: true }, expect.any(Function));
  });

  it('keeps the screen awake from the lobby on', async () => {
    const request = vi.fn(async () => ({ released: false, release: async () => {} }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    savePlayer('123456', 'kept-token');
    open();
    act(() => sockets[0].fire('state', { role: 'player', phase: 'lobby', autopilot: false, paused: false, questionIndex: -1, splash: null }, { serverNow: Date.now(), hostOnline: true, stageOnline: true }));
    await settle();
    expect(request).toHaveBeenCalledWith('screen');
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  const WARNING = 'Не давай екрану згаснути — блокування теж вважається виходом';
  const fireState = (over: object) =>
    act(() =>
      sockets[0].fire('state', { role: 'player', phase: 'question', autopilot: false, paused: false, questionIndex: 0, splash: null, awayPenalty: true, ...over }, { serverNow: Date.now(), hostOnline: true, stageOnline: true }),
    );

  it('without Wake Lock and with the away penalty the phone asks to keep the screen on during the game, not in the lobby', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    savePlayer('123456', 'kept-token');
    open();
    fireState({ phase: 'lobby', questionIndex: -1 });
    await settle();
    expect(screen.queryByText(WARNING)).toBeNull();
    fireState({});
    await settle();
    expect(screen.getByText(WARNING).getAttribute('role')).toBe('note');
    fireState({ awayPenalty: false });
    await settle();
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('a refused Wake Lock warns too; a lock granted on a later tap removes the line', async () => {
    const request = vi.fn(async () => ({ released: false, release: async () => {} }));
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    savePlayer('123456', 'kept-token');
    open();
    fireState({});
    await settle();
    expect(screen.getByText(WARNING)).not.toBeNull();
    fireEvent.click(document.body);
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(WARNING)).toBeNull();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('a granted Wake Lock shows no line', async () => {
    const request = vi.fn(async () => ({ released: false, release: async () => {} }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    savePlayer('123456', 'kept-token');
    open();
    fireState({});
    await settle();
    expect(screen.queryByText(WARNING)).toBeNull();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
});
