// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupDetail, GroupItem } from '@quiz/shared';
import { createGroupItem, getGroup, getGroupItems, me, updateGroupItem } from '../api';
import { forgetAccount } from '../useAccount';
import { GroupItemPage } from './GroupItemPage';

vi.mock('../api', () => ({ me: vi.fn(), getGroup: vi.fn(), getGroupItems: vi.fn(), createGroupItem: vi.fn(), updateGroupItem: vi.fn(), uploadImage: vi.fn() }));

const at = '2026-11-14T10:00:00.000Z';
const group: GroupDetail = {
  id: 'g1',
  name: 'Родина Квіткових',
  emoji: '🌻',
  description: '',
  role: 'member',
  people: 2,
  items: 2,
  joinedAt: at,
  members: [
    { id: 'u1', nickname: 'Оля', avatar: null, role: 'owner', joinedAt: at, you: false },
    { id: 'u2', nickname: 'Петро', avatar: null, role: 'member', joinedAt: at, you: true },
  ],
};
const base: Omit<GroupItem, 'id' | 'mine'> = {
  kind: 'story',
  text: 'Як тато заблукав у лісі по гриби',
  about: [{ kind: 'name', name: 'тато' }],
  answer: 'Тато',
  year: 1998,
  photo: null,
  surprise: false,
  author: { id: 'u2', nickname: 'Петро', avatar: null },
  canDelete: true,
  uses: [],
  createdAt: at,
  updatedAt: at,
};

beforeEach(() => {
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u2', name: 'Петро', email: 'p@example.com', admin: false });
  vi.mocked(getGroup).mockResolvedValue({ ok: true, ...group });
  vi.mocked(getGroupItems).mockResolvedValue({ ok: true, data: [{ ...base, id: 'i1', mine: true }, { ...base, id: 'i2', mine: false }] });
  vi.mocked(createGroupItem).mockResolvedValue({ ok: true, ...base, id: 'i3', mine: true });
  vi.mocked(updateGroupItem).mockResolvedValue({ ok: true, ...base, id: 'i1', mine: true });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}`}</p>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/groups/:id/new" element={<GroupItemPage />} />
        <Route path="/profile/groups/:id/items/:itemId" element={<GroupItemPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('GroupItemPage (12k)', () => {
  it('a new record starts empty and goes back to the group after saving', async () => {
    open('/profile/groups/g1/new');
    expect(await screen.findByRole('heading', { name: 'Новий запис' })).toBeTruthy();
    const text = (await screen.findByLabelText('Текст')) as HTMLTextAreaElement;
    expect(text.value).toBe('');
    fireEvent.change(text, { target: { value: 'Перша поїздка на море всією родиною' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти запис' }));
    expect(await screen.findByText('на /profile/groups/g1')).toBeTruthy();
    expect(createGroupItem).toHaveBeenCalledWith('g1', expect.objectContaining({ text: 'Перша поїздка на море всією родиною', kind: 'fact' }));
  });

  it('editing fills the form from the record', async () => {
    open('/profile/groups/g1/items/i1');
    expect(await screen.findByRole('heading', { name: 'Змінити запис' })).toBeTruthy();
    expect(((await screen.findByLabelText('Текст')) as HTMLTextAreaElement).value).toBe('Як тато заблукав у лісі по гриби');
    expect((screen.getByLabelText('Рік') as HTMLInputElement).value).toBe('1998');
    expect(screen.getByRole('radio', { name: 'Історія' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти запис' }));
    expect(await screen.findByText('на /profile/groups/g1')).toBeTruthy();
    expect(updateGroupItem).toHaveBeenCalledWith('g1', 'i1', expect.objectContaining({ answer: 'Тато', year: 1998 }));
  });

  it('somebody else’s record is not found', async () => {
    open('/profile/groups/g1/items/i2');
    expect((await screen.findByRole('alert')).textContent).toBe('Запис не знайдено.');
  });
});
