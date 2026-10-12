// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinGame, me } from '../api';
import { loadPlayer, savePlayer } from '../storage';
import { Play } from './Play';

const { sockets, FakeSocket } = vi.hoisted(() => {
  /** Підставний сокет: тест сам вирішує, які події прийшли із сервера. */
  class FakeSocket {
    connected = true;
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
vi.mock('../api', () => ({ joinGame: vi.fn(), me: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  sockets.length = 0;
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
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
      'Ця гра вже почалася, приєднатися до неї не можна. Попросіть ведучого створити нову.',
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
