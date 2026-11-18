// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeagueTable as LeagueTableData } from '@quiz/shared';
import { groupLeague } from '../api';
import { LeagueTable } from './LeagueTable';

vi.mock('../api', () => ({ groupLeague: vi.fn() }));

const card = (id: string, nickname: string) => ({ id, nickname, avatar: null });
const november: LeagueTableData = {
  month: '2026-11',
  current: true,
  months: ['2026-11', '2026-10'],
  rows: [
    { place: 1, user: card('u1', 'Оля'), points: 27, games: 3, firsts: 2, former: false },
    { place: 2, user: card('u2', 'Петро'), points: 17, games: 3, firsts: 1, former: false },
    { place: 3, user: card('u3', 'Ярослава-Довгоніковна'), points: 5, games: 1, firsts: 0, former: true },
  ],
  champions: [{ month: '2026-10', users: [card('u2', 'Тарас'), card('u4', 'Ірина')] }],
};
const october: LeagueTableData = { ...november, month: '2026-10', current: false, rows: [] };

beforeEach(() => {
  vi.mocked(groupLeague).mockReset();
  vi.mocked(groupLeague).mockResolvedValue({ ok: true, data: november });
});
afterEach(cleanup);

describe('LeagueTable', () => {
  it('shows an accessible table of places, players, points, games and first places', async () => {
    render(<LeagueTable groupId="g1" me="u2" />);
    const table = await screen.findByRole('table');
    expect(table.className).toContain('league-table');
    for (const name of ['Місце', 'Учасник', 'Бали', 'Ігор', 'Перших місць']) {
      expect(within(table).getByRole('columnheader', { name })).toBeTruthy();
    }
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText('Оля')).toBeTruthy();
    expect(within(rows[1]).getByText('27')).toBeTruthy();
    expect(rows[2].className).toContain('is-me');
    expect(rows[1].className).not.toContain('is-me');
    expect(within(rows[3]).getByText(/вже не в групі/)).toBeTruthy();
    expect(groupLeague).toHaveBeenCalledWith('g1', undefined);
  });

  it('puts the rules under the table', async () => {
    render(<LeagueTable groupId="g1" me="u1" />);
    expect(await screen.findByText(/10 \/ 7 \/ 5 \/ 3 \/ 1/)).toBeTruthy();
  });

  it('switches to a past month', async () => {
    render(<LeagueTable groupId="g1" me="u1" />);
    const select = await screen.findByLabelText('Місяць');
    expect(within(select).getByRole('option', { name: 'листопад 2026 (поточний)' })).toBeTruthy();
    vi.mocked(groupLeague).mockResolvedValue({ ok: true, data: october });
    fireEvent.change(select, { target: { value: '2026-10' } });
    await waitFor(() => expect(groupLeague).toHaveBeenLastCalledWith('g1', '2026-10'));
    expect(await screen.findByText('Цього місяця ще не було ігор для ліги.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: /./ })).toBeNull();
  });

  it('says so when the month has no games', async () => {
    vi.mocked(groupLeague).mockResolvedValue({ ok: true, data: { ...november, rows: [] } });
    render(<LeagueTable groupId="g1" me="u1" />);
    expect(await screen.findByText('Цього місяця ще не було ігор для ліги.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists the winners of past months', async () => {
    render(<LeagueTable groupId="g1" me="u1" />);
    expect(await screen.findByRole('heading', { name: 'Зала переможців' })).toBeTruthy();
    expect(screen.getByText('жовтень 2026 — Тарас, Ірина')).toBeTruthy();
  });

  it('says there are no winners yet', async () => {
    vi.mocked(groupLeague).mockResolvedValue({ ok: true, data: { ...november, champions: [] } });
    render(<LeagueTable groupId="g1" me="u1" />);
    expect(await screen.findByText(/Переможців ще немає/)).toBeTruthy();
  });

  it('a failed month keeps the select, shows the error under it, and another month still works', async () => {
    render(<LeagueTable groupId="g1" me="u1" />);
    const select = await screen.findByRole('combobox', { name: 'Місяць' });
    vi.mocked(groupLeague).mockResolvedValue({ ok: false, error: 'group_not_found' });
    fireEvent.change(select, { target: { value: '2026-10' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Місяць' })).toBeTruthy();
    vi.mocked(groupLeague).mockResolvedValue({ ok: true, data: november });
    fireEvent.change(screen.getByRole('combobox', { name: 'Місяць' }), { target: { value: '2026-11' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('shows the error when the table cannot be read', async () => {
    vi.mocked(groupLeague).mockResolvedValue({ ok: false, error: 'group_not_found' });
    render(<LeagueTable groupId="g1" me="u1" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
