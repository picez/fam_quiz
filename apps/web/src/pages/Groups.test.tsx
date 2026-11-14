// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupCard, GroupInviteCard } from '@quiz/shared';
import { acceptGroupInvite, createGroup, declineGroupInvite, getGroups, me } from '../api';
import { forgetAccount } from '../useAccount';
import { Groups } from './Groups';

vi.mock('../api', () => ({
  me: vi.fn(),
  getGroups: vi.fn(),
  acceptGroupInvite: vi.fn(),
  declineGroupInvite: vi.fn(),
  createGroup: vi.fn(),
}));

const card = (id: string, extra: Partial<GroupCard> = {}): GroupCard => ({
  id,
  name: `Група ${id}`,
  emoji: '👪',
  description: '',
  role: 'member',
  people: 3,
  items: 1,
  joinedAt: '2026-11-14T10:00:00.000Z',
  ...extra,
});
const invite: GroupInviteCard = { group: { id: 'g9', name: 'Родина Квіткових', emoji: '🌻', people: 2 }, from: { id: 'u2', nickname: 'Оля', avatar: null }, at: '2026-11-14T10:00:00.000Z' };

beforeEach(() => {
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [card('g1', { name: 'Родина Квіткових', role: 'owner', people: 5, items: 12 }), card('g2', { name: 'Друзі з класу', emoji: '🎓' })], invites: [invite] });
  vi.mocked(acceptGroupInvite).mockResolvedValue({ ok: true, id: 'g9' });
  vi.mocked(declineGroupInvite).mockResolvedValue({ ok: true });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = (path = '/profile/groups') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/groups" element={<Groups />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Groups (12k)', () => {
  it('shows the invites first, then the cards with people, records and the owner mark', async () => {
    const { container } = open();
    const invites = await screen.findByRole('heading', { name: 'Тебе запрошують' });
    expect(screen.getByText('Оля запрошує в групу 🌻 «Родина Квіткових»')).toBeTruthy();
    const cards = container.querySelector('ul.group-cards')!;
    expect(Boolean(invites.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    const links = [...cards.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/profile/groups/g1', '/profile/groups/g2']);
    expect(links[0]!.textContent).toContain('5 людей · 12 записів · керує групою');
    expect(links[1]!.textContent).toContain('3 людини · 1 запис');
    expect(links[1]!.textContent).not.toContain('керує групою');
  });

  it('«Приєднатися» accepts the invite and opens the group', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Приєднатися' }));
    expect(await screen.findByText('на /profile/groups/g9')).toBeTruthy();
    expect(acceptGroupInvite).toHaveBeenCalledWith('g9');
  });

  it('«Відхилити» removes the row', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Відхилити' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Тебе запрошують' })).toBeNull());
    expect(declineGroupInvite).toHaveBeenCalledWith('g9');
  });

  it('a failed accept says why', async () => {
    vi.mocked(acceptGroupInvite).mockResolvedValue({ ok: false, error: 'too_many_groups' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Приєднатися' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Можна бути щонайбільше в 10 групах. Вийди з якоїсь, щоб приєднатися до нової.');
  });

  it('a failed accept re-reads the list, so a gone invite disappears and the error stays', async () => {
    vi.mocked(acceptGroupInvite).mockResolvedValue({ ok: false, error: 'invite_not_found' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Приєднатися' }));
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [card('g1')], invites: [] });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Тебе запрошують' })).toBeNull());
    expect(screen.getByRole('alert').textContent).toBe('Запрошення вже не діє.');
    expect(getGroups).toHaveBeenCalledTimes(2);
  });

  it('an empty list has a friendly text and the create form makes a group', async () => {
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: [], invites: [] });
    vi.mocked(createGroup).mockResolvedValue({ ok: true, ...card('g5'), members: [] });
    open();
    expect(await screen.findByText(/Ще жодної групи/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Створити групу' }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Родина Квіткових' } });
    fireEvent.click(screen.getByRole('button', { name: 'Створити' }));
    expect(await screen.findByText('на /profile/groups/g5')).toBeTruthy();
    expect(createGroup).toHaveBeenCalledWith({ name: 'Родина Квіткових', emoji: '👪', description: '' });
  });

  it('at ten groups «Створити групу» is disabled with a hint', async () => {
    vi.mocked(getGroups).mockResolvedValue({ ok: true, groups: Array.from({ length: 10 }, (_, i) => card(`g${i}`)), invites: [] });
    open();
    const button = await screen.findByRole('button', { name: 'Створити групу' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Можна бути щонайбільше в 10 групах. Вийди з якоїсь, щоб приєднатися до нової.')).toBeTruthy();
  });

  it('a visitor is sent to sign in and back', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('на /login?next=%2Fprofile%2Fgroups')).toBeTruthy();
  });
});
