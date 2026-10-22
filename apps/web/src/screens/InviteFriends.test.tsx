// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyFriends, getRoomInvites, inviteFriends } from '../api';
import { InviteFriends } from './InviteFriends';

vi.mock('../api', () => ({ getMyFriends: vi.fn(), getRoomInvites: vi.fn(), inviteFriends: vi.fn() }));

const friends = [
  { id: 'olya', nickname: 'Оля', avatar: null },
  { id: 'taras', nickname: 'Тарас', avatar: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: friends });
  vi.mocked(getRoomInvites).mockResolvedValue({ ok: true, data: { invited: ['taras'] } });
});
afterEach(cleanup);

describe('InviteFriends', () => {
  it('opens the friends list and invites one friend', async () => {
    vi.mocked(inviteFriends).mockResolvedValue({ ok: true, data: { invited: ['taras', 'olya'] } });
    render(<InviteFriends code="123456" />);
    fireEvent.click(screen.getByRole('button', { name: 'Запросити друзів' }));
    await screen.findByText('Оля');
    expect(screen.getByText('Тарас')).toBeTruthy();
    const rowButtons = () => within(screen.getByRole('list')).getAllByRole('button') as HTMLButtonElement[];
    expect(rowButtons().map((b) => b.textContent)).toEqual(['Запросити', 'Запрошено']);
    expect(rowButtons()[1]!.disabled).toBe(true);
    fireEvent.click(rowButtons()[0]!);
    await waitFor(() => expect(inviteFriends).toHaveBeenCalledWith('123456', ['olya']));
    await waitFor(() => expect(rowButtons()[0]!.textContent).toBe('Запрошено'));
    expect(rowButtons()[0]!.disabled).toBe(true);
  });

  it('without friends shows the hint and a profile link in a new tab', async () => {
    vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(getRoomInvites).mockResolvedValue({ ok: true, data: { invited: [] } });
    render(<InviteFriends code="123456" />);
    fireEvent.click(screen.getByRole('button', { name: 'Запросити друзів' }));
    await screen.findByText('Друзів поки немає. Додайте їх у профілі.');
    const link = screen.getByRole('link', { name: 'Відкрити профіль' });
    expect(link.getAttribute('href')).toBe('/profile');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows the error text when inviting fails', async () => {
    vi.mocked(inviteFriends).mockResolvedValue({ ok: false, error: 'wrong_phase' });
    render(<InviteFriends code="123456" />);
    fireEvent.click(screen.getByRole('button', { name: 'Запросити друзів' }));
    await screen.findByText('Оля');
    fireEvent.click(screen.getByRole('button', { name: 'Запросити' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Зараз цього зробити не можна.');
  });
});
