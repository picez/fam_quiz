// @vitest-environment jsdom
import type { AdminHealth as Health } from '@quiz/shared';
import type { JSX } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../format';
import { AdminHealth } from './AdminCharts';
import { adminHealth } from './admin-api';
import { bytesText } from './admin-text';

vi.mock('./admin-api', () => ({ adminHealth: vi.fn() }));

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
