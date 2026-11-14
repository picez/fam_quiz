// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ACHIEVEMENTS, levelProgress, type OwnProfile, type PrizeContent, type PrizeItem } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrize, getMyProfile, me, myPrizes, updatePrize } from '../api';
import { PrizeStudioPage } from './PrizeStudioPage';

vi.mock('../api', () => ({
  me: vi.fn(),
  getMyProfile: vi.fn(),
  myPrizes: vi.fn(),
  createPrize: vi.fn(),
  updatePrize: vi.fn(),
}));
vi.mock('../editor/ImageField', () => ({ ImageField: () => <div /> }));
vi.mock('../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: () => false }));

const content = (name: string, over: Partial<PrizeContent> = {}): PrizeContent => ({
  name,
  trophy: null,
  engraving: null,
  real: null,
  title: null,
  diploma: true,
  ...over,
});
const item = (id: string, name: string, over: Partial<PrizeItem> = {}): PrizeItem => ({
  id,
  content: content(name),
  status: 'free',
  createdAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

const profile: OwnProfile = {
  id: 'u1',
  nickname: 'Олена',
  avatar: null,
  email: 'o@example.com',
  stats: { games: 0, wins: 0, accuracy: null, quizzes: 0, hosted: 0, podium: { first: 0, second: 0, third: 0 }, top3: null, bestScore: null, avgPlace: null },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: false, earnedAt: null })),
  quizzes: [],
  wins: [],
  friends: [],
  showcase: { title: null, awards: [], pins: { prizes: [], achievements: [] } },
  level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null, photo: null, font: null, effect: null } },
  likes: { author: 0, host: 0, player: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: profile });
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [item('p1', 'Кубок року'), item('p2', 'Піца', { status: 'reserved' })] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/prizes/new" element={<PrizeStudioPage />} />
        <Route path="/profile/prizes/:id" element={<PrizeStudioPage />} />
        <Route path="/profile/prizes" element={<p>склад</p>} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

describe('PrizeStudioPage', () => {
  it('new saves and goes back', async () => {
    vi.mocked(createPrize).mockResolvedValue({ ok: true, ...item('p3', 'Новий') });
    open('/profile/prizes/new');
    expect(await screen.findByRole('heading', { name: 'Новий приз' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Приз/ }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Новий' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(createPrize).toHaveBeenCalled());
    expect(vi.mocked(createPrize).mock.calls[0]![0]).toMatchObject({ name: 'Новий', trophy: { kind: 'cup', material: 'gold' } });
    expect(await screen.findByText('склад')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/profile/prizes');
  });

  it('edit loads the prize', async () => {
    vi.mocked(updatePrize).mockResolvedValue({ ok: true, ...item('p1', 'Кубок 2') });
    open('/profile/prizes/p1');
    expect(await screen.findByRole('heading', { name: 'Зміна призу' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Приз/ }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Назва') as HTMLInputElement).value).toBe('Кубок року');
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Кубок 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(updatePrize).toHaveBeenCalledWith('p1', content('Кубок 2')));
    expect(await screen.findByText('склад')).toBeTruthy();
  });

  it('a reserved prize is view only', async () => {
    open('/profile/prizes/p2');
    expect(await screen.findByText('Приз лежить у грі — його можна лише переглянути.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Зберегти' })).toBeNull();
  });

  it('unknown id', async () => {
    open('/profile/prizes/zzz');
    expect(await screen.findByText('Такого призу немає на складі.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/profile/prizes');
  });

  it('server error stays on the page', async () => {
    vi.mocked(createPrize).mockResolvedValue({ ok: false, error: 'decor_locked' });
    open('/profile/prizes/new');
    await screen.findByRole('heading', { name: 'Новий приз' });
    fireEvent.click(screen.getByRole('tab', { name: /Приз/ }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Новий' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Цей шрифт чи наліпка ще закриті: вони відкриються з вищим рівнем.');
    expect(screen.getByTestId('where').textContent).toBe('/profile/prizes/new');
  });

  it('cancel goes back to the store', async () => {
    open('/profile/prizes/p1');
    await screen.findByRole('heading', { name: 'Зміна призу' });
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(await screen.findByText('склад')).toBeTruthy();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/profile/prizes/new');
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });
});
