// @vitest-environment jsdom
import type { AdminChartDay, AdminHealth as Health } from '@quiz/shared';
import type { JSX } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../format';
import { AdminCharts, AdminHealth } from './AdminCharts';
import { adminCharts, adminHealth } from './admin-api';
import { bytesText } from './admin-text';

vi.mock('./admin-api', () => ({ adminCharts: vi.fn(), adminHealth: vi.fn() }));

const dayOf = (n: number) => new Date(Date.UTC(2026, 9, 21 + n)).toISOString().slice(0, 10);
const days: AdminChartDay[] = Array.from({ length: 30 }, (_, n) => ({
  day: dayOf(n),
  players: n,
  games: n === 0 ? 0 : n + 1,
  finished: n,
  completion: n === 0 ? null : 50,
  returns: n < 7 ? null : 40,
}));

const health = (over: Partial<Health> = {}): Health => ({
  backup: { state: 'ok', at: '2026-11-16T03:00:00.000Z', bytes: 3_145_728 },
  uptimeSec: 97_200,
  memory: { rss: 157_286_400, heapUsed: 52_428_800, heapTotal: 62_914_560, external: 2_097_152 },
  rooms: 2,
  connections: 9,
  checkedAt: '2026-11-19T10:00:00.000Z',
  server: { commit: 'abc1234', node: 'v22.11.0', startedAt: '2026-11-18T07:00:00.000Z', cpuPercent: 3.5, lagMs: { p50: 10.2, p99: 20.4, max: 35 } },
  live: { lobby: 1, playing: 1, paused: 0, bot: 0, autopilot: 0, playersOnline: 5, playersTotal: 6, maxRooms: 500, restarting: false },
  db: null,
  backups: { count: 3, bytes: 9_437_184 },
  problems: null,
  ...over,
});

const show = (node: JSX.Element) => render(<MemoryRouter>{node}</MemoryRouter>);
const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('AdminCharts', () => {
  it('draws 30 bars per chart and an sr-only table with the same values', async () => {
    vi.mocked(adminCharts).mockResolvedValue({ ok: true, data: { days, computedAt: '2026-11-19T09:55:00.000Z' } });
    show(<AdminCharts />);
    const players = await screen.findByRole('img', { name: 'Активні гравці (акаунти, що зіграли гру)' });
    const charts = screen.getAllByRole('img');
    expect(charts).toHaveLength(4);
    expect(players.tagName.toLowerCase()).toBe('svg');
    expect(players.getAttribute('viewBox')).toBe('0 0 300 120');
    // День із нулем — без стовпчика (вісь уже позначає нуль), але в таблиці лишається «0».
    expect(players.querySelectorAll('rect')).toHaveLength(29);
    expect(screen.getByRole('img', { name: 'Ігор за день' }).querySelectorAll('rect')).toHaveLength(29);
    expect(screen.getByRole('img', { name: 'Дограно до кінця, %' }).querySelectorAll('rect')).toHaveLength(29);
    expect(screen.getByRole('img', { name: 'Повернення, %' }).querySelectorAll('rect')).toHaveLength(23);
    expect(screen.getByText('Частка тих, хто грав 8–14 днів тому й зіграв знову за останні 7 днів.')).toBeTruthy();

    const tables = document.querySelectorAll('table.sr-only');
    expect(tables).toHaveLength(4);
    const completion = screen.getByRole('table', { name: 'Дограно до кінця, %' });
    const rows = within(completion).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(30);
    expect(within(rows[0]!).getAllByRole('cell')[1]!.textContent).toBe('—');
    expect(within(rows[1]!).getAllByRole('cell')[1]!.textContent).toBe('50');
    const playerRows = within(screen.getByRole('table', { name: 'Активні гравці (акаунти, що зіграли гру)' })).getAllByRole('row').slice(1);
    expect(within(playerRows[29]!).getAllByRole('cell')[1]!.textContent).toBe('29');
    expect(within(playerRows[0]!).getAllByRole('cell')[1]!.textContent).toBe('0');
    expect(within(players).getByText('макс. 29')).toBeTruthy();
    // Відсоткові графіки масштабовані до 100 %, тож і підпис верху — 100 %, а не найбільше значення.
    expect(within(screen.getByRole('img', { name: 'Дограно до кінця, %' })).getByText('макс. 100 %')).toBeTruthy();
    expect(within(screen.getByRole('img', { name: 'Повернення, %' })).getByText('макс. 100 %')).toBeTruthy();
    expect(screen.queryByText('макс. 50')).toBeNull();
    expect(screen.getByText(`Пораховано ${formatDate('2026-11-19T09:55:00.000Z')}; оновлюється раз на 10 хв.`)).toBeTruthy();
  });

  it('draws no bar for a zero day and keeps a 1-unit bar visible next to a large one', async () => {
    vi.mocked(adminCharts).mockResolvedValue({ ok: true, data: { days: days.map((d, n) => ({ ...d, games: n === 3 ? 1 : n === 4 ? 10_000 : 0 })), computedAt: '2026-11-19T09:55:00.000Z' } });
    show(<AdminCharts />);
    const games = await screen.findByRole('img', { name: 'Ігор за день' });
    const bars = games.querySelectorAll('rect');
    expect(bars).toHaveLength(2);
    expect(Number(bars[0]!.getAttribute('height'))).toBe(1);
  });

  it('a chart with only zeros and gaps says «Немає даних за ці дні.» instead of an empty frame', async () => {
    vi.mocked(adminCharts).mockResolvedValue({ ok: true, data: { days: days.map((d) => ({ ...d, players: 0, returns: null })), computedAt: '2026-11-19T09:55:00.000Z' } });
    show(<AdminCharts />);
    await screen.findByRole('img', { name: 'Ігор за день' });
    expect(screen.queryByRole('img', { name: 'Активні гравці (акаунти, що зіграли гру)' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Повернення, %' })).toBeNull();
    expect(screen.getAllByText('Немає даних за ці дні.')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Активні гравці (акаунти, що зіграли гру)' })).toBeTruthy();
    expect(screen.queryByText('макс. 0')).toBeNull();
  });
});

describe('AdminHealth', () => {
  it('shows the health block: backup date and size, «Копій ще немає», «Сховище копій не налаштоване», uptime, memory, rooms, connections', async () => {
    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: health() });
    const view = show(<AdminHealth />);
    await screen.findByText('Остання копія бази');
    expect(screen.getByRole('heading', { name: 'Стан' })).toBeTruthy();
    expect(value('Остання копія бази')).toBe(`${formatDate('2026-11-16T03:00:00.000Z')}, ${bytesText(3_145_728)}`);
    expect(value('Сервер працює')).toBe('1 д 3 год');
    expect(value("Пам'ять процесу")).toBe(`${bytesText(157_286_400)} (купа ${bytesText(52_428_800)})`);
    expect(value('Живі кімнати')).toBe('2');
    expect(value("З'єднання")).toBe('9');
    view.unmount();

    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: health({ backup: { state: 'none' } }) });
    const none = show(<AdminHealth />);
    expect(await screen.findByText('Копій ще немає')).toBeTruthy();
    none.unmount();

    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: health({ backup: { state: 'off' } }) });
    const off = show(<AdminHealth />);
    expect(await screen.findByText('Сховище копій не налаштоване')).toBeTruthy();
    off.unmount();

    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: health({ backup: { state: 'error' } }) });
    show(<AdminHealth />);
    expect(await screen.findByText('Не вдалося прочитати сховище копій')).toBeTruthy();
  });
});
