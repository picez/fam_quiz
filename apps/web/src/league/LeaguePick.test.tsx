// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaguePickInfo } from '@quiz/shared';
import { gameLeague, pickLeague } from '../api';
import { LeaguePick } from './LeaguePick';

vi.mock('../api', () => ({ gameLeague: vi.fn(), pickLeague: vi.fn() }));

const family = '11111111-1111-4111-8111-111111111111';
const friends = '22222222-2222-4222-8222-222222222222';
const info = (groupId: string | null = null): LeaguePickInfo => ({
  groupId,
  groups: [
    { id: family, name: 'Родина', emoji: '🏡', people: 4 },
    { id: friends, name: 'Друзі', emoji: '🎲', people: 3 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gameLeague).mockResolvedValue({ ok: true, data: info() });
});
afterEach(cleanup);

describe('LeaguePick', () => {
  it('lists the host groups and «— не для ліги»', async () => {
    render(<LeaguePick code="123456" />);
    const select = (await screen.findByLabelText('Гра для групи')) as HTMLSelectElement;
    expect(screen.getByText('🏆 Сімейна ліга')).toBeTruthy();
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['— не для ліги', '🏡 Родина', '🎲 Друзі']);
    expect(select.value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Гра для групи' })).toBe(select);
    expect(screen.getByText(/Після старту змінити не можна/)).toBeTruthy();
  });

  it('has the ⓘ in the title that opens the «Сімейна ліга» help', async () => {
    render(<LeaguePick code="123456" />);
    await screen.findByLabelText('Гра для групи');
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Сімейна ліга' }));
    expect(screen.getByRole('dialog', { name: 'Сімейна ліга' })).toBeTruthy();
  });

  it('shows the group already marked', async () => {
    vi.mocked(gameLeague).mockResolvedValue({ ok: true, data: info(friends) });
    render(<LeaguePick code="123456" />);
    expect(((await screen.findByLabelText('Гра для групи')) as HTMLSelectElement).value).toBe(friends);
  });

  it('picking a group sends it and says «Збережено»; picking none sends null', async () => {
    vi.mocked(pickLeague).mockResolvedValue({ ok: true, data: info(family) });
    render(<LeaguePick code="123456" />);
    const select = await screen.findByLabelText('Гра для групи');
    fireEvent.change(select, { target: { value: family } });
    await waitFor(() => expect(pickLeague).toHaveBeenCalledWith('123456', family));
    expect(await screen.findByText('Збережено')).toBeTruthy();
    vi.mocked(pickLeague).mockResolvedValue({ ok: true, data: info(null) });
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(pickLeague).toHaveBeenLastCalledWith('123456', null));
  });

  it('a refused pick says why and puts the select back', async () => {
    vi.mocked(pickLeague).mockResolvedValue({ ok: false, error: 'wrong_phase' });
    render(<LeaguePick code="123456" />);
    const select = (await screen.findByLabelText('Гра для групи')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: family } });
    expect(await screen.findByText('Зараз цього зробити не можна.')).toBeTruthy();
    expect(select.value).toBe('');
    expect(screen.queryByText('Збережено')).toBeNull();
  });

  it('no groups: the hint that the league is only for your own group', async () => {
    vi.mocked(gameLeague).mockResolvedValue({ ok: true, data: { groupId: null, groups: [] } });
    render(<LeaguePick code="123456" />);
    expect(await screen.findByText('Ти ще не в жодній групі — лігу можна вести лише для своєї групи.')).toBeTruthy();
    expect(screen.queryByLabelText('Гра для групи')).toBeNull();
  });

  it('404 and 401 leave the component empty', async () => {
    vi.mocked(gameLeague).mockResolvedValue({ ok: false, error: 'not_found' });
    const first = render(<LeaguePick code="123456" />);
    await waitFor(() => expect(gameLeague).toHaveBeenCalled());
    expect(first.container.querySelector('.league-pick')).toBeNull();
    expect(first.container.textContent).toBe('');
    first.unmount();
    vi.mocked(gameLeague).mockResolvedValue({ ok: false, error: 'unauthorized' });
    const second = render(<LeaguePick code="123456" />);
    await waitFor(() => expect(gameLeague).toHaveBeenCalledTimes(2));
    expect(second.container.textContent).toBe('');
  });
});
