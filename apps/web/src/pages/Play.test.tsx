// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinGame } from '../api';
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
vi.mock('../api', () => ({ joinGame: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  sockets.length = 0;
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
