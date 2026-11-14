// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupDetail } from '@quiz/shared';
import { cancelGroupInvite, getMyFriends, inviteToGroup, refreshGroupCode } from '../api';
import { InvitePanel } from './InvitePanel';

vi.mock('../api', () => ({ getMyFriends: vi.fn(), inviteToGroup: vi.fn(), cancelGroupInvite: vi.fn(), refreshGroupCode: vi.fn() }));

const at = '2026-11-14T10:00:00.000Z';
const friend = (id: string, nickname: string) => ({ id, nickname, avatar: null, lastSeenAt: null });
const group: GroupDetail = {
  id: 'g1',
  name: 'Родина Квіткових',
  emoji: '🌻',
  description: '',
  role: 'owner',
  people: 2,
  items: 0,
  joinedAt: at,
  members: [
    { id: 'u1', nickname: 'Оля', avatar: null, role: 'owner', joinedAt: at, you: true },
    { id: 'u2', nickname: 'Петро', avatar: null, role: 'member', joinedAt: at, you: false },
  ],
  inviteCode: 'abcdefghjk',
  pending: [{ user: { id: 'u3', nickname: 'Іра', avatar: null }, at }],
};
const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: [friend('u2', 'Петро'), friend('u3', 'Іра'), friend('u4', 'Марко'), friend('u5', 'Дана')] });
  vi.mocked(inviteToGroup).mockResolvedValue({ ok: true, invited: [] });
  vi.mocked(cancelGroupInvite).mockResolvedValue({ ok: true });
  vi.mocked(refreshGroupCode).mockResolvedValue({ ok: true, inviteCode: 'zzzzzzzzzz' });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const link = () => screen.getByRole('textbox', { name: 'Запросити' }) as HTMLInputElement;

describe('InvitePanel (12k)', () => {
  it('shows the link with the code, copies it and makes a new one', async () => {
    render(<InvitePanel group={group} onChanged={vi.fn()} />);
    expect(link().value).toMatch(/\/groups\/join\/abcdefghjk$/);
    expect(screen.getByTitle('QR-код посилання в групу')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Копіювати посилання' }));
    expect((await screen.findByRole('status')).textContent).toBe('Посилання скопійовано');
    expect(writeText).toHaveBeenCalledWith(link().value);
    fireEvent.click(screen.getByRole('button', { name: 'Нове посилання' }));
    await waitFor(() => expect(link().value).toMatch(/\/groups\/join\/zzzzzzzzzz$/));
    expect(window.confirm).toHaveBeenCalledWith('Старе посилання перестане діяти. Створити нове?');
    expect(screen.getByRole('status').textContent).toBe('Нове посилання готове, старе більше не діє');
  });

  it('lists friends without members and the invited, sends the picked ones', async () => {
    const onChanged = vi.fn();
    render(<InvitePanel group={group} onChanged={onChanged} />);
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes.map((box) => box.closest('label')!.lastElementChild!.textContent)).toEqual(['Марко', 'Дана']);
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Надіслати запрошення' }));
    await waitFor(() => expect(inviteToGroup).toHaveBeenCalledWith('g1', ['u4', 'u5']));
    expect(await screen.findByText('Запрошення надіслано')).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });

  it('cancels a pending invite', async () => {
    render(<InvitePanel group={group} onChanged={vi.fn()} />);
    expect(screen.getByText('Чекають відповіді')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати запрошення' }));
    await waitFor(() => expect(cancelGroupInvite).toHaveBeenCalledWith('g1', 'u3'));
  });

  it('says so when every friend is here or invited', async () => {
    vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: [friend('u2', 'Петро')] });
    render(<InvitePanel group={group} onChanged={vi.fn()} />);
    expect(await screen.findByText('Усі твої друзі вже тут або запрошені.')).toBeTruthy();
  });

  it('a member does not see the panel and does not ask for friends', () => {
    const { container } = render(<InvitePanel group={{ ...group, role: 'member', inviteCode: undefined, pending: undefined }} onChanged={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    expect(getMyFriends).not.toHaveBeenCalled();
  });

  it('a failed copy says so', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<InvitePanel group={group} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Копіювати посилання' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Не вдалося скопіювати. Виділи посилання й скопіюй вручну.');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
