// @vitest-environment jsdom
import type { AdminBackups as Data } from '@quiz/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeText, viewerZone } from '../calendar/calendar-time';
import { formatDate } from '../format';
import { AdminBackups } from './AdminBackups';
import { bytesText } from './admin-text';

const NEW_KEY = 'backups/db/2026-11-20T03-00-00Z-m0047.jsonl.gz';
const OLD_KEY = 'backups/db/2026-11-13T03-00-00Z-m0046.jsonl.gz';

type Call = { url: string; method: string };
let calls: Call[] = [];
/** Відповіді на GET по черзі; остання повторюється. */
let reads: Data[];
let started: { status: number; body: unknown };

const base = (over: Partial<Data> = {}): Data => ({
  stored: true,
  enabled: true,
  rows: [
    { key: NEW_KEY, at: '2026-11-20T03:00:00.000Z', bytes: 5_452_595, level: 47 },
    { key: OLD_KEY, at: '2026-11-13T03:00:00.000Z', bytes: 4_194_304, level: 46 },
  ],
  running: false,
  last: null,
  nextAt: null,
  ...over,
});

function server() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url === '/api/admin/backups' && method === 'GET') return json(reads.length > 1 ? reads.shift() : reads[0]);
      if (url === '/api/admin/backups' && method === 'POST') return json(started.body, started.status);
      return json({ error: 'not_found' }, 404);
    }),
  );
}

const open = () =>
  render(
    <MemoryRouter>
      <AdminBackups />
    </MemoryRouter>,
  );
const nowButton = () => screen.getByRole('button', { name: 'Зробити копію зараз' }) as HTMLButtonElement;

beforeEach(() => {
  reads = [base()];
  started = { status: 202, body: {} };
  server();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminBackups', () => {
  it('lists copies and shows how to restore', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    open();
    expect(await screen.findByText(`Остання копія: ${formatDate('2026-11-20T03:00:00.000Z')}, ${bytesText(5_452_595)}`)).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Копії' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText(formatDate('2026-11-20T03:00:00.000Z'))).toBeTruthy();
    expect(within(items[0]!).getByText(bytesText(5_452_595))).toBeTruthy();
    expect(within(items[0]!).getByText('міграцій: 47')).toBeTruthy();
    expect(within(items[1]!).getByText('міграцій: 46')).toBeTruthy();

    const how = screen.getByRole('region', { name: 'Як відновити' });
    expect(within(how).getByText('З адмінки відновлення немає — це надто небезпечно. Власник відновлює з командного рядка:')).toBeTruthy();
    expect(within(how).getByText('pnpm --filter @quiz/server db:restore --r2-list')).toBeTruthy();
    expect(within(how).getByText('pnpm --filter @quiz/server db:restore --r2-latest')).toBeTruthy();
    expect(within(how).getByText('pnpm --filter @quiz/server db:restore --r2 {key}')).toBeTruthy();

    // Живі області стоять з першого показу, порожні.
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'Команда відновлення' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`pnpm --filter @quiz/server db:restore --r2 ${NEW_KEY}`));
    expect(await screen.findByText('Команду скопійовано.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Відновити/ })).toBeNull();
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('take a copy now: confirm, running, then the next time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const nextAt = new Date(Date.now() + 50 * 60_000).toISOString();
    open();
    await screen.findByText(/^Остання копія:/);
    reads = [base({ running: true }), base({ running: false, nextAt, last: { at: '2026-11-20T10:05:00.000Z', by: 'admin', outcome: 'ok', key: NEW_KEY, bytes: 5_452_595 } })];
    fireEvent.click(nowButton());
    expect(window.confirm).toHaveBeenCalledWith('Зняти копію бази зараз? Це займе до кількох хвилин; ігри не зупиняться.');
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(await screen.findByText('Копія знімається…')).toBeTruthy();
    expect(nowButton().disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    const time = timeText(nextAt, viewerZone());
    expect(await screen.findByText(`Наступну копію можна о ${time}.`)).toBeTruthy();
    expect(screen.queryByText('Копія знімається…')).toBeNull();
    expect(screen.getByText(`Остання спроба: вдалася ${formatDate('2026-11-20T10:05:00.000Z')} (вручну), ${bytesText(5_452_595)}`)).toBeTruthy();
    expect(nowButton().disabled).toBe(true);
  });

  it('does nothing when the confirm is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    open();
    await screen.findByText(/^Остання копія:/);
    fireEvent.click(nowButton());
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('says why the copy did not start: too recent with the next time, busy', async () => {
    const nextAt = '2026-11-20T11:05:00.000Z';
    open();
    await screen.findByText(/^Остання копія:/);
    started = { status: 409, body: { error: 'backup_recent', nextAt } };
    fireEvent.click(nowButton());
    expect((await screen.findByRole('alert')).textContent).toBe(`Не частіше однієї копії на годину. Наступну копію можна о ${timeText(nextAt, viewerZone())}.`);
    started = { status: 409, body: { error: 'backup_busy' } };
    fireEvent.click(nowButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Копія вже знімається.'));
    started = { status: 503, body: { error: 'backup_off' } };
    fireEvent.click(nowButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Копії на цьому сервері вимкнені.'));
    started = { status: 429, body: { error: 'too_many' } };
    fireEvent.click(nowButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).not.toBe('Копії на цьому сервері вимкнені.'));
  });

  it('off and no store', async () => {
    reads = [base({ enabled: false })];
    open();
    expect(await screen.findByText('Копії на цьому сервері вимкнені (лише продакшен або DB_BACKUP=on).')).toBeTruthy();
    expect(nowButton().disabled).toBe(true);
    cleanup();
    reads = [base({ stored: false, enabled: false, rows: [] })];
    open();
    expect(await screen.findByText('Сховище копій не налаштоване.')).toBeTruthy();
    expect(screen.queryByText('Копій ще немає.')).toBeNull();
    expect(nowButton().disabled).toBe(true);
  });

  it('no copies yet and a list that could not be read', async () => {
    reads = [{ ...base({ rows: [] }), error: true } as Data];
    open();
    expect(await screen.findByText('Не вдалося прочитати список копій.')).toBeTruthy();
    cleanup();
    reads = [base({ rows: [] })];
    open();
    expect(await screen.findByText('Копій ще немає.')).toBeTruthy();
  });

  it('the last failed attempt points to the errors tab', async () => {
    reads = [base({ last: { at: '2026-11-20T03:00:00.000Z', by: 'schedule', outcome: 'failed', key: null, bytes: null } })];
    open();
    expect(await screen.findByText(`Остання спроба: не вдалася ${formatDate('2026-11-20T03:00:00.000Z')} (за розкладом) — подробиці у вкладці «Звернення»:`)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Збої сервера' }).getAttribute('href')).toBe('/admin/appeals/errors');
    cleanup();
    reads = [base({ last: { at: '2026-11-20T03:00:00.000Z', by: 'schedule', outcome: 'locked', key: null, bytes: null } })];
    open();
    expect(await screen.findByText(`Остання спроба ${formatDate('2026-11-20T03:00:00.000Z')}: копію вже знімав інший екземпляр сервера.`)).toBeTruthy();
  });
});
