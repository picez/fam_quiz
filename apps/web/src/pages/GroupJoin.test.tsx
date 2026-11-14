// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupJoinPreview } from '@quiz/shared';
import { getGroupJoin, joinGroup, me } from '../api';
import { forgetAccount } from '../useAccount';
import { GroupJoin } from './GroupJoin';

vi.mock('../api', () => ({ me: vi.fn(), getGroupJoin: vi.fn(), joinGroup: vi.fn() }));

const CODE = 'abcdefghjk';
const preview: GroupJoinPreview = {
  id: 'g1',
  name: 'Родина Квіткових',
  emoji: '🌻',
  description: 'Усі, хто збирається на свята в бабусі',
  people: 1,
  owner: { id: 'u2', nickname: 'Оля', avatar: null },
  member: false,
};

beforeEach(() => {
  forgetAccount();
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Петро', email: 'p@example.com', admin: false });
  vi.mocked(getGroupJoin).mockResolvedValue({ ok: true, ...preview });
  vi.mocked(joinGroup).mockResolvedValue({ ok: true, id: 'g1' });
});
afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p>{`на ${location.pathname}${location.search}`}</p>;
}

const open = (code = CODE) =>
  render(
    <MemoryRouter initialEntries={[`/groups/join/${code}`]}>
      <Routes>
        <Route path="/groups/join/:code" element={<GroupJoin />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('GroupJoin (12k)', () => {
  it('a guest is asked to sign in and comes back to the same link, without a preview request', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('Увійди, щоб приєднатися')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe(`/login?next=%2Fgroups%2Fjoin%2F${CODE}`);
    expect(getGroupJoin).not.toHaveBeenCalled();
    expect(screen.queryByText('Родина Квіткових')).toBeNull();
  });

  it('a newcomer sees the card and joins only by pressing «Приєднатися»', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Родина Квіткових' })).toBeTruthy();
    expect(screen.getByText('Оля кличе тебе в групу')).toBeTruthy();
    expect(screen.getByText('1 людина')).toBeTruthy();
    expect(joinGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Приєднатися' }));
    expect(await screen.findByText('на /profile/groups/g1')).toBeTruthy();
    expect(joinGroup).toHaveBeenCalledWith(CODE);
  });

  it('a member is told so with a link to the group', async () => {
    vi.mocked(getGroupJoin).mockResolvedValue({ ok: true, ...preview, member: true });
    open();
    expect(await screen.findByText('Ти вже в цій групі.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Відкрити групу' }).getAttribute('href')).toBe('/profile/groups/g1');
    expect(screen.queryByRole('button', { name: 'Приєднатися' })).toBeNull();
  });

  it('a refreshed code says the link no longer works', async () => {
    vi.mocked(getGroupJoin).mockResolvedValue({ ok: false, error: 'group_not_found' });
    open();
    expect(await screen.findByText('Це посилання вже не діє. Попроси нове в того, хто тебе запросив.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Приєднатися' })).toBeNull();
  });

  it('a failed join says why', async () => {
    vi.mocked(joinGroup).mockResolvedValue({ ok: false, error: 'too_many_groups' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Приєднатися' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Можна бути щонайбільше в 10 групах. Вийди з якоїсь, щоб приєднатися до нової.');
  });

  it('a wrong code is gone without a request', async () => {
    open('abc');
    expect(await screen.findByText('Це посилання вже не діє. Попроси нове в того, хто тебе запросив.')).toBeTruthy();
    expect(getGroupJoin).not.toHaveBeenCalled();
  });
});
