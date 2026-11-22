// @vitest-environment jsdom
import type { AdminHealth as Health } from '@quiz/shared';
import type { JSX } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../format';
import { AdminHealth } from './AdminHealth';
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
    // Час роботи — лише в рядку «Запущено», без окремого дубля.
    expect(screen.queryByText('Сервер працює')).toBeNull();
    expect(value('Запущено')).toContain('(працює 1 д 3 год)');
    expect(value("Пам'ять процесу")).toBe(`${bytesText(157_286_400)}; купа ${bytesText(52_428_800)} з ${bytesText(62_914_560)}; поза купою ${bytesText(2_097_152)}`);
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

  const group = (name: string) => screen.getByRole('heading', { name, level: 3 }).closest('section')!;
  const inGroup = (name: string, label: string) => within(group(name)).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
  const full = (over: Partial<Health> = {}) =>
    health({
      server: { commit: 'abc1234', node: 'v22.11.0', startedAt: '2026-11-18T07:00:00.000Z', cpuPercent: 12.5, lagMs: { p50: 1.2, p99: 8, max: 20 } },
      live: { lobby: 1, playing: 2, paused: 1, bot: 1, autopilot: 1, playersOnline: 3, playersTotal: 5, maxRooms: 20, restarting: false },
      db: { bytes: 25_165_824, rows: { user: 12, quiz: 7, game: 30, participant: 90, answer: 900, game_event: 2000, saved_game: 1, activity_day: 40 }, push: { subscriptions: 4, people: 3 } },
      backups: { count: 4, bytes: 12_582_912 },
      problems: { errors24h: 3, errorKinds24h: 1, errorsNew: 2, problemsOpen: 1, reportsOpen: 0 },
      ...over,
    });

  it('groups the health rows: server, live games, database, problems', async () => {
    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: full() });
    show(<AdminHealth />);
    await screen.findByText('Остання копія бази');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Сервер', 'Ігри зараз', 'База даних', 'Проблеми']);

    expect(inGroup('Сервер', 'Версія')).toBe('abc1234');
    expect(inGroup('Сервер', 'Node.js')).toBe('v22.11.0');
    expect(inGroup('Сервер', 'Запущено')).toBe(`${formatDate('2026-11-18T07:00:00.000Z')} (працює 1 д 3 год)`);
    expect(inGroup('Сервер', 'Процесор за останню хвилину')).toBe('12,5 % одного ядра');
    expect(inGroup('Сервер', 'Затримка циклу подій')).toBe('типово 1,2 мс; 99 % — до 8 мс; макс. 20 мс');

    expect(inGroup('Ігри зараз', 'Лобі')).toBe('1');
    expect(inGroup('Ігри зараз', 'Ігри, що йдуть')).toBe('2');
    expect(inGroup('Ігри зараз', 'На паузі')).toBe('1');
    expect(inGroup('Ігри зараз', 'Кімнати Квіз-бота')).toBe('1');
    expect(inGroup('Ігри зараз', 'Під автопілотом')).toBe('1');
    expect(inGroup('Ігри зараз', 'Гравців у кімнатах')).toBe("3 на зв'язку з 5");
    expect(inGroup('Ігри зараз', 'Заповненість')).toBe('2 з 20 кімнат');
    expect(within(group('Ігри зараз')).queryByRole('status')).toBeNull();

    expect(inGroup('База даних', 'Розмір бази')).toBe(bytesText(25_165_824));
    const rows = within(group('База даних')).getByText('Рядків у таблицях', { selector: 'dt' }).nextElementSibling as HTMLElement;
    expect(within(rows).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['акаунти 12', 'вікторини 7', 'ігри 30', 'учасники ігор 90', 'відповіді 900', 'події ігор 2000', 'збережені ігри 1', 'дні активності 40'].map((text) => text.replace(/(\d)(\d{3})$/, `$1${' '}$2`)));
    expect(inGroup('База даних', 'Підписки на сповіщення')).toBe('4 (людей: 3)');
    expect(inGroup('База даних', 'Копій у сховищі')).toBe('4, разом 12,0 МБ');

    expect(inGroup('Проблеми', 'Збоїв за 24 год')).toBe('3 (різних: 1)');
    expect(within(group('Проблеми')).getByRole('link', { name: '2' }).getAttribute('href')).toBe('/admin/appeals/errors');
    expect(within(group('Проблеми')).getByRole('link', { name: '1' }).getAttribute('href')).toBe('/admin/appeals/problems');
    expect(within(group('Проблеми')).getByRole('link', { name: '0' }).getAttribute('href')).toBe('/admin/appeals/complaints');
    expect(screen.getByText(`Перевірено ${formatDate('2026-11-19T10:00:00.000Z')}`)).toBeTruthy();
  });

  it('shows unknown version, waiting CPU and lag, a restart notice and database failures', async () => {
    vi.mocked(adminHealth).mockResolvedValue({
      ok: true,
      data: full({
        server: { commit: null, node: 'v22.11.0', startedAt: '2026-11-18T07:00:00.000Z', cpuPercent: null, lagMs: null },
        live: { lobby: 0, playing: 0, paused: 0, bot: 0, autopilot: 0, playersOnline: 0, playersTotal: 0, maxRooms: 20, restarting: true },
        db: null,
        backups: null,
        problems: null,
      }),
    });
    show(<AdminHealth />);
    await screen.findByText('Остання копія бази');
    expect(inGroup('Сервер', 'Версія')).toBe('невідома (локальний запуск)');
    expect(inGroup('Сервер', 'Процесор за останню хвилину')).toBe('ще міряється — за хвилину після запуску');
    expect(inGroup('Сервер', 'Затримка циклу подій')).toBe('ще міряється — за хвилину після запуску');
    expect(within(group('Ігри зараз')).getByRole('status').textContent).toBe('Сервер перезапускається: нові ігри тимчасово не стартують.');
    expect(within(group('База даних')).getByText('Не вдалося прочитати базу — спробуй «Оновити».')).toBeTruthy();
    expect(within(group('База даних')).queryByText('Розмір бази')).toBeNull();
    expect(inGroup('База даних', 'Копій у сховищі')).toBe('—');
    expect(within(group('Проблеми')).getByText('Не вдалося прочитати базу — спробуй «Оновити».')).toBeTruthy();
  });

  it('shows a dash for an unknown database size', async () => {
    const data = full();
    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: { ...data, db: { ...data.db!, bytes: null } } });
    show(<AdminHealth />);
    await screen.findByText('Остання копія бази');
    expect(inGroup('База даних', 'Розмір бази')).toBe('—');
  });

  it('refreshes with a second request and keeps the numbers in between', async () => {
    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: full() });
    show(<AdminHealth />);
    await screen.findByText('Остання копія бази');
    let resolve: (value: { ok: true; data: Health }) => void = () => {};
    vi.mocked(adminHealth).mockReturnValue(new Promise((done) => (resolve = done)));
    fireEvent.click(screen.getByRole('button', { name: 'Оновити' }));
    expect(adminHealth).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Завантажуємо…')).toBeNull();
    expect(screen.getByText('Остання копія бази')).toBeTruthy();
    // Поки йде перечитування — кнопка показує поступ і не тиснеться вдруге.
    const busy = screen.getByRole('button', { name: 'Оновлення…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await act(async () => resolve({ ok: true, data: full({ checkedAt: '2026-11-19T10:05:00.000Z' }) }));
    expect(screen.getByText(`Перевірено ${formatDate('2026-11-19T10:05:00.000Z')}`)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Оновити' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when a refresh failed and keeps the previous numbers', async () => {
    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: full() });
    show(<AdminHealth />);
    await screen.findByText('Остання копія бази');
    vi.mocked(adminHealth).mockResolvedValue({ ok: false, error: 'offline' });
    fireEvent.click(screen.getByRole('button', { name: 'Оновити' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Не вдалося оновити — показано попередні дані.');
    expect(screen.getByText(`Перевірено ${formatDate('2026-11-19T10:00:00.000Z')}`)).toBeTruthy();
    vi.mocked(adminHealth).mockResolvedValue({ ok: true, data: full() });
    fireEvent.click(screen.getByRole('button', { name: 'Оновити' }));
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
