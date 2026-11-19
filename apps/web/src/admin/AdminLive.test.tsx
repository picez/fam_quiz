// @vitest-environment jsdom
import type { AdminLiveRoom } from '@quiz/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorText } from '../i18n';
import { AdminLive } from './AdminLive';
import { adminLive, closeLiveGame } from './admin-api';

vi.mock('./admin-api', () => ({ adminLive: vi.fn(), closeLiveGame: vi.fn() }));

const AT = '2026-11-19T10:00:00.000Z';
const room = (over: Partial<AdminLiveRoom> = {}): AdminLiveRoom => ({
  code: '123456',
  title: 'Річки України',
  host: 'Олена',
  autopilot: false,
  players: { online: 3, total: 4 },
  status: 'playing',
  round: { number: 2, of: 5 },
  openedAt: '2026-11-19T08:55:00.000Z',
  actedAt: '2026-11-19T09:57:00.000Z',
  stageUrl: '/stage/123456#tok',
  ...over,
});
const list = (rooms: AdminLiveRoom[]) => ({ ok: true as const, data: { rooms, at: AT } });
const open = () =>
  render(
    <MemoryRouter>
      <AdminLive />
    </MemoryRouter>,
  );
const card = (code: string) => screen.getByText(code).closest('li') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(closeLiveGame).mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AdminLive', () => {
  it('shows each room with code, quiz, host, players, state and age', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room(), room({ code: '654321', title: 'Карпати', status: 'lobby', round: null, players: { online: 1, total: 1 } })]));
    open();
    await screen.findByText('Код 123 456');
    const first = card('Код 123 456');
    expect(within(first).getByText('Річки України').getAttribute('dir')).toBe('auto');
    expect(within(first).getByText('Ведучий: Олена')).toBeTruthy();
    expect(within(first).getByText("Гравці: 3 на зв'язку з 4")).toBeTruthy();
    expect(within(first).getByText('Раунд 2 з 5')).toBeTruthy();
    expect(within(first).getByText('Триває 1 год 5 хв')).toBeTruthy();
    expect(within(first).getByText('Остання дія: 3 хв тому')).toBeTruthy();
    expect(within(card('Код 654 321')).getByText('Лобі')).toBeTruthy();
  });

  it('a room opened less than a minute ago reads «Відкрито щойно», not «Триває щойно»', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room({ openedAt: '2026-11-19T09:59:30.000Z' })]));
    open();
    const first = (await screen.findByText('Код 123 456')).closest('li') as HTMLElement;
    expect(within(first).getByText('Відкрито щойно')).toBeTruthy();
    expect(within(first).queryByText(/Триває/)).toBeNull();
  });

  it('a failed poll keeps the list and says the data is stale; the next good poll clears the note', async () => {
    vi.useFakeTimers();
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    open();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.mocked(adminLive).mockResolvedValueOnce({ ok: false, error: 'offline' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Код 123 456')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Спробувати ще' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Не вдалося оновити; показано останні дані.');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.queryByText('Не вдалося оновити; показано останні дані.')).toBeNull();
  });

  it('skips a tick while the previous request is still on its way, so a slow answer still shows', async () => {
    vi.useFakeTimers();
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    open();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    let answer: (value: Awaited<ReturnType<typeof adminLive>>) => void = () => undefined;
    vi.mocked(adminLive).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(2);
    await act(async () => {
      answer(list([room({ code: '777888' })]));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Код 777 888')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(3);
  });

  it('shows the paused round and the starting state', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room({ status: 'paused' }), room({ code: '111222', status: 'starting', round: null })]));
    open();
    expect(await screen.findByText('Пауза · раунд 2 з 5')).toBeTruthy();
    expect(within(card('Код 111 222')).getByText('Починається')).toBeTruthy();
  });

  it('shows «Автопілот (нік)» and «Ведучий без акаунта»', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room({ autopilot: true, host: 'Богдан' }), room({ code: '222333', host: null })]));
    open();
    expect(await screen.findByText('Автопілот (Богдан)')).toBeTruthy();
    expect(within(card('Код 222 333')).getByText('Ведучий без акаунта')).toBeTruthy();
  });

  it('says so when there are no games', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([]));
    open();
    expect(await screen.findByText('Зараз жодної гри.')).toBeTruthy();
  });

  it('reloads every 10 seconds while open without a loading flash and stops after leaving', async () => {
    vi.useFakeTimers();
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    const view = open();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Код 123 456')).toBeTruthy();
    expect(adminLive).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(adminLive).toHaveBeenCalledTimes(1);
    let answer: (value: Awaited<ReturnType<typeof adminLive>>) => void = () => undefined;
    vi.mocked(adminLive).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(adminLive).toHaveBeenCalledTimes(2);
    // Відповідь ще в дорозі: на екрані лишається попередній список, без «Завантаження…».
    expect(screen.queryByText('Завантаження…')).toBeNull();
    expect(screen.getByText('Код 123 456')).toBeTruthy();
    await act(async () => {
      answer(list([room({ code: '777888' })]));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Код 777 888')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Завантаження…')).toBeNull();
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(3);
  });

  it('pauses the refresh while the browser tab is hidden and reads again on return', async () => {
    vi.useFakeTimers();
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    open();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(adminLive).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(adminLive).toHaveBeenCalledTimes(3);
  });

  it('«Оновити» reads the list again', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Оновити' }));
    await waitFor(() => expect(adminLive).toHaveBeenCalledTimes(2));
  });

  it('«Закрити гру» asks first, closes and reloads; «Скасувати» does nothing', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    open();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Закрити гру' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Закрити гру 123 456 «Річки України»? Гравці побачать кінець гри.');
    expect(closeLiveGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити гру' }));
    await waitFor(() => expect(closeLiveGame).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(adminLive).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('status')).textContent).toBe('Гру 123 456 закрито.');
  });

  it('a finished room has no «Закрити гру»', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room({ status: 'finished', round: null })]));
    open();
    expect(await screen.findByText('Кінець')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Закрити гру' })).toBeNull();
  });

  it('«Відкрити сцену» opens the stage link in a new tab', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    open();
    const link = await screen.findByRole('link', { name: 'Відкрити сцену' });
    expect(link.getAttribute('href')).toBe('/stage/123456#tok');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the error when closing fails', async () => {
    vi.mocked(adminLive).mockResolvedValue(list([room()]));
    vi.mocked(closeLiveGame).mockResolvedValue({ ok: false, error: 'game_finished' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Закрити гру' }));
    expect((await screen.findByRole('alert')).textContent).toBe(errorText('game_finished'));
  });
});
