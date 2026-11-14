// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupDetail } from '@quiz/shared';
import { deleteGroup, getGroup, getGroupItems, getMyFriends, leaveGroup, me, removeGroupMember, transferGroup, updateGroup } from '../api';
import { forgetAccount } from '../useAccount';
import { GroupPage } from './GroupPage';

vi.mock('../api', () => ({
  me: vi.fn(),
  getGroup: vi.fn(),
  getGroupItems: vi.fn(),
  deleteGroupItem: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  transferGroup: vi.fn(),
  removeGroupMember: vi.fn(),
  leaveGroup: vi.fn(),
  getMyFriends: vi.fn(),
  inviteToGroup: vi.fn(),
  cancelGroupInvite: vi.fn(),
  refreshGroupCode: vi.fn(),
}));

const at = '2026-11-14T10:00:00.000Z';
function detail(role: 'owner' | 'member'): GroupDetail {
  const base: GroupDetail = {
    id: 'g1',
    name: 'Родина Квіткових',
    emoji: '🌻',
    description: 'Усі, хто збирається на свята в бабусі',
    role,
    people: 2,
    items: 1,
    joinedAt: at,
    members: [
      { id: 'u1', nickname: 'Оля', avatar: null, role: 'owner', joinedAt: at, you: role === 'owner' },
      { id: 'u2', nickname: 'Петро', avatar: null, role: 'member', joinedAt: at, you: role === 'member' },
    ],
  };
  return role === 'owner' ? { ...base, inviteCode: 'abcdefghjk', pending: [] } : base;
}

beforeEach(() => {
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Оля', email: 'o@example.com', admin: false });
  vi.mocked(getGroup).mockResolvedValue({ ok: true, ...detail('owner') });
  vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(getMyFriends).mockResolvedValue({ ok: true, data: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = (path = '/profile/groups/g1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/groups/:id" element={<GroupPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const tabs = () => within(screen.getByRole('tablist', { name: 'Розділи групи' })).getAllByRole('tab').map((tab) => tab.textContent);

describe('GroupPage (12k)', () => {
  it('a member sees two tabs, the owner three', async () => {
    open();
    expect(await screen.findByRole('heading', { name: '🌻 Родина Квіткових' })).toBeTruthy();
    expect(screen.getByText('2 людини · 1 запис')).toBeTruthy();
    expect(tabs()).toEqual(['Записи', 'Учасники', 'Налаштування']);
    cleanup();
    vi.mocked(getGroup).mockResolvedValue({ ok: true, ...detail('member') });
    open('/profile/groups/g1?tab=settings');
    await screen.findByRole('heading', { name: '🌻 Родина Квіткових' });
    expect(tabs()).toEqual(['Записи', 'Учасники']);
    expect(screen.getByRole('tab', { name: 'Записи' }).getAttribute('aria-selected')).toBe('true');
  });

  it('?tab=people opens the members with the owner first; handing over hides the settings', async () => {
    open('/profile/groups/g1?tab=people');
    const rows = (await screen.findAllByRole('listitem')).filter((li) => li.closest('.group-member-list') !== null);
    expect(rows[0]!.textContent).toContain('Оля · керує групою · це ти');
    vi.mocked(transferGroup).mockResolvedValue({ ok: true, ...detail('member') });
    vi.mocked(getGroup).mockResolvedValue({ ok: true, ...detail('member') });
    fireEvent.click(screen.getByRole('button', { name: 'Передати керування' }));
    expect(window.confirm).toHaveBeenCalledWith('Передати керування групою Петро? Ти лишишся в групі, як усі.');
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Налаштування' })).toBeNull());
    expect(transferGroup).toHaveBeenCalledWith('g1', 'u2');
  });

  it('«Вилучити» asks and removes', async () => {
    vi.mocked(removeGroupMember).mockResolvedValue({ ok: true });
    open('/profile/groups/g1?tab=people');
    fireEvent.click(await screen.findByRole('button', { name: 'Вилучити' }));
    await waitFor(() => expect(removeGroupMember).toHaveBeenCalledWith('g1', 'u2'));
  });

  it('the owner cannot leave; a member leaves and goes to the list', async () => {
    open('/profile/groups/g1?tab=people');
    const own = (await screen.findByRole('button', { name: 'Вийти з групи' })) as HTMLButtonElement;
    expect(own.disabled).toBe(true);
    expect(screen.getByText('Щоб вийти, спершу передай керування комусь іншому.')).toBeTruthy();
    cleanup();
    vi.mocked(getGroup).mockResolvedValue({ ok: true, ...detail('member') });
    vi.mocked(leaveGroup).mockResolvedValue({ ok: true });
    open('/profile/groups/g1?tab=people');
    fireEvent.click(await screen.findByRole('button', { name: 'Вийти з групи' }));
    expect(await screen.findByText('на /profile/groups')).toBeTruthy();
    expect(leaveGroup).toHaveBeenCalledWith('g1');
  });

  it('settings save a new name; «Видалити групу» deletes and goes to the list', async () => {
    vi.mocked(updateGroup).mockResolvedValue({ ok: true, ...detail('owner'), name: 'Квіткові' });
    vi.mocked(deleteGroup).mockResolvedValue({ ok: true });
    open('/profile/groups/g1?tab=settings');
    const name = await screen.findByLabelText('Назва');
    fireEvent.change(name, { target: { value: 'Квіткові' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('Збережено')).toBeTruthy();
    expect(updateGroup).toHaveBeenCalledWith('g1', { name: 'Квіткові', emoji: '🌻', description: 'Усі, хто збирається на свята в бабусі' });
    expect(screen.getByRole('heading', { name: '🌻 Квіткові' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Видалити групу' }));
    expect(window.confirm).toHaveBeenCalledWith('Видалити групу «Квіткові» разом з усіма записами? Це назавжди.');
    expect(await screen.findByText('на /profile/groups')).toBeTruthy();
  });

  it('a missing group says so with a link to the list', async () => {
    vi.mocked(getGroup).mockResolvedValue({ ok: false, error: 'group_not_found' });
    open();
    expect((await screen.findByRole('alert')).textContent).toBe('Групу не знайдено — можливо, її видалили або тебе в ній немає.');
    expect(screen.getByRole('link', { name: 'Групи' }).getAttribute('href')).toBe('/profile/groups');
  });
});
