// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyRow } from '@quiz/shared';
import { listLobbies } from '../api';
import { LobbyList } from './LobbyList';

vi.mock('../api', () => ({ listLobbies: vi.fn() }));

const NOW = Date.parse('2026-11-04T12:00:00Z');
const row = (over: Partial<LobbyRow> = {}): LobbyRow => ({
  code: '123456',
  title: 'Вечір кіно',
  host: { id: 'h1', nickname: 'Ведуча', avatar: null, level: { level: 3, color: null, frame: null } },
  players: 2,
  maxPlayers: 50,
  rounds: 1,
  questions: 5,
  locked: false,
  late: false,
  friends: [],
  openedAt: new Date(NOW - 12 * 60_000).toISOString(),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(listLobbies).mockReset();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = async () => {
  render(
    <MemoryRouter>
      <LobbyList />
    </MemoryRouter>,
  );
  await act(async () => {});
};
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('LobbyList', () => {
  it('rows: shows the lobby as a link with its facts', async () => {
    vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [row({ locked: true, late: true, friends: ['Оля', 'Петро'] })] });
    await show();
    expect(screen.getByRole('heading', { name: 'Відкриті ігри' })).toBeTruthy();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/play/123456');
    expect(link.textContent).not.toContain('Увійти');
    expect(link.getAttribute('aria-label')).toBeNull();
    const inside = within(link);
    for (const text of ['Вечір кіно', 'Ведуча', 'Рів. 3', 'гравців: 2 з 50', '1 раунд', '5 запитань', 'вже йде', 'друзі тут: Оля, Петро']) {
      expect(inside.getByText(text)).toBeTruthy();
    }
    expect(inside.getByText(/^створено .*12/)).toBeTruthy();
    expect(inside.getByRole('img', { name: 'з паролем' })).toBeTruthy();
    expect(inside.getByRole('img', { name: /Ведуча/ })).toBeTruthy();
  });

  it('rows: a lobby under a minute old says «створено щойно», and the link is named by title and host', async () => {
    vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [row({ openedAt: new Date(NOW - 20_000).toISOString() })] });
    await show();
    const link = screen.getByRole('link');
    expect(within(link).getByText('створено щойно')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Вечір кіно Ведуча/ })).toBeTruthy();
  });

  it('poll: becoming visible while a load is running does not start a second one', async () => {
    let finish: (value: { ok: true; data: LobbyRow[] }) => void = () => {};
    vi.mocked(listLobbies).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await show();
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(listLobbies).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: [] }));
  });

  it('rows: no lock, running flag or friends line when not set', async () => {
    vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [row()] });
    await show();
    expect(screen.queryByRole('img', { name: 'з паролем' })).toBeNull();
    expect(screen.queryByText('вже йде')).toBeNull();
    expect(screen.queryByText(/друзі тут/)).toBeNull();
  });

  it('empty: says there are no open games', async () => {
    vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [] });
    await show();
    expect(screen.getByText('Зараз немає відкритих ігор — введи код або створи свою')).toBeTruthy();
  });

  it('poll: asks again every 5 s, keeps rows while loading, stops when hidden or unmounted', async () => {
    let finish: (value: Awaited<ReturnType<typeof listLobbies>>) => void = () => {};
    vi.mocked(listLobbies).mockResolvedValueOnce({ ok: true, data: [row()] }).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    vi.mocked(listLobbies).mockResolvedValue({ ok: true, data: [row({ code: '654321', title: 'Інша гра' })] });
    const view = render(
      <MemoryRouter>
        <LobbyList />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(listLobbies).toHaveBeenCalledTimes(1);
    await tick(4999);
    expect(listLobbies).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(listLobbies).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Вечір кіно')).toBeTruthy();
    await act(async () => finish({ ok: true, data: [row({ code: '654321', title: 'Інша гра' })] }));
    expect(screen.queryByText('Вечір кіно')).toBeNull();
    expect(screen.getByText('Інша гра')).toBeTruthy();

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await tick(20_000);
    expect(listLobbies).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {});
    expect(listLobbies).toHaveBeenCalledTimes(3);

    view.unmount();
    await tick(20_000);
    expect(listLobbies).toHaveBeenCalledTimes(3);
  });

  it('error: first failure shows a notice; a later failure keeps the old rows', async () => {
    vi.mocked(listLobbies).mockResolvedValueOnce({ ok: false, error: 'unknown' }).mockResolvedValueOnce({ ok: true, data: [row()] }).mockResolvedValue({ ok: false, error: 'unknown' });
    await show();
    expect(screen.getByText('Не вдалося оновити список ігор')).toBeTruthy();
    await tick(5000);
    expect(screen.getByText('Вечір кіно')).toBeTruthy();
    expect(screen.queryByText('Не вдалося оновити список ігор')).toBeNull();
    await tick(5000);
    expect(screen.getByText('Вечір кіно')).toBeTruthy();
    expect(screen.getByText('Не вдалося оновити список ігор')).toBeTruthy();
  });
});
