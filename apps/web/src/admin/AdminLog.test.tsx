// @vitest-environment jsdom
import type { AdminLogEntry } from '@quiz/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateLocaleForTests, t } from '../i18n';
import { AdminLog } from './AdminLog';

const row = (id: string): AdminLogEntry => ({ id, at: '2026-11-20T21:30:00.000Z', kind: 'group_hide', admin: 'Ганна', target: 'Оля', details: { title: 'Родина', reason: null } });
const admins = [
  { id: 'a1', nickname: 'Ганна' },
  { id: 'a2', nickname: 'Петро' },
];
let exportBody: { rows: AdminLogEntry[]; total: number } = { rows: [row('x1')], total: 1 };
let exportStatus = 200;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith('/api/admin/log/export')) return json(exportBody, exportStatus);
  if (url.startsWith('/api/admin/log?')) return json({ rows: [row('r1')], total: 80, page: Number(new URL(url, 'http://x').searchParams.get('page')), pages: 2, admins });
  return json({ error: 'not_found' }, 404);
});
const urls = () => fetchMock.mock.calls.map(([url]) => url);
const lastLog = () => urls().filter((url) => url.startsWith('/api/admin/log?')).at(-1);

const createObjectURL = vi.fn((blob: Blob) => {
  void blob;
  return 'blob:log';
});

beforeEach(() => {
  fetchMock.mockClear();
  createObjectURL.mockClear();
  exportBody = { rows: [row('x1')], total: 1 };
  exportStatus = 200;
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const open = (entry = '/admin/log') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AdminLog />
    </MemoryRouter>,
  );

describe('AdminLog filters (63)', () => {
  it('filters go to the request and reset the page', async () => {
    open();
    await screen.findByText(/Родина/);
    expect(lastLog()).toBe('/api/admin/log?page=1');
    fireEvent.click(screen.getByRole('button', { name: t('adminNext') }));
    await waitFor(() => expect(lastLog()).toBe('/api/admin/log?page=2'));

    fireEvent.click(screen.getByLabelText('Модерація'));
    await waitFor(() => expect(lastLog()).toBe('/api/admin/log?groups=moderation&page=1'));
    expect(urls().some((url) => url.includes('groups='))).toBe(true);

    fireEvent.change(screen.getByLabelText('Хто'), { target: { value: 'a1' } });
    await waitFor(() => expect(lastLog()).toBe('/api/admin/log?admin=a1&groups=moderation&page=1'));

    fireEvent.change(screen.getByLabelText('Від'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('До'), { target: { value: '2026-11-20' } });
    await waitFor(() => expect(lastLog()).toBe('/api/admin/log?admin=a1&groups=moderation&from=2026-11-01&to=2026-11-20&page=1'));

    fireEvent.change(screen.getByLabelText('Пошук'), { target: { value: 'полісь' } });
    expect(lastLog()).not.toContain('q=');
    fireEvent.click(screen.getByRole('button', { name: 'Шукати' }));
    await waitFor(() => expect(lastLog()).toContain(`q=${encodeURIComponent('полісь')}`));

    // Знявши останню групу, ключ groups зникає зовсім.
    fireEvent.click(screen.getByLabelText('Модерація'));
    await waitFor(() => expect(lastLog()).not.toContain('groups'));
  });

  it('reads the filters from the address', async () => {
    open('/admin/log?groups=bot&from=2026-11-01');
    await screen.findByText(/Родина/);
    expect((screen.getByLabelText('Бот') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Модерація') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Від') as HTMLInputElement).value).toBe('2026-11-01');
    expect(lastLog()).toBe('/api/admin/log?groups=bot&from=2026-11-01&page=1');
  });

  it('the export downloads the selection', async () => {
    open('/admin/log?groups=moderation');
    await screen.findByText(/Родина/);
    fireEvent.click(screen.getByRole('button', { name: 'Вивантажити CSV' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(urls()).toContain('/api/admin/log/export?groups=moderation');
    expect(createObjectURL.mock.calls[0]![0].type).toBe('text/csv;charset=utf-8');
    expect(screen.queryByText(/10\D000/)).toBeNull();
  });

  it('warns when more than 10 000 rows match', async () => {
    exportBody = { rows: Array.from({ length: 10_000 }, (_, i) => row(`x${i}`)), total: 10_002 };
    open();
    await screen.findByText(/Родина/);
    fireEvent.click(screen.getByRole('button', { name: 'Вивантажити CSV' }));
    expect(await screen.findByText(/10\D000/)).toBeTruthy();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('formats the row cap in the active language (63)', async () => {
    activateLocaleForTests('en', { ui: { adminLogCsvCapped: 'Only the first {count} rows.' } });
    try {
      exportBody = { rows: Array.from({ length: 10_000 }, (_, i) => row(`x${i}`)), total: 10_002 };
      open();
      await screen.findByText(/Родина/);
      fireEvent.click(screen.getByRole('button', { name: 'Вивантажити CSV' }));
      expect(await screen.findByText('Only the first 10,000 rows.')).toBeTruthy();
    } finally {
      activateLocaleForTests('uk');
    }
  });

  it('frees the file link only after the download has started (63)', async () => {
    open();
    await screen.findByText(/Родина/);
    fireEvent.click(screen.getByRole('button', { name: 'Вивантажити CSV' }));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:log'), { timeout: 2500 });
  });

  it('shows the error text when the export fails', async () => {
    exportStatus = 500;
    exportBody = { rows: [], total: 0 };
    open();
    await screen.findByText(/Родина/);
    fireEvent.click(screen.getByRole('button', { name: 'Вивантажити CSV' }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
