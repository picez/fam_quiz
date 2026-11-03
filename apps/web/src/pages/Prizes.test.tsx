// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ACHIEVEMENTS, levelProgress, type OwnProfile, type PrizeContent, type PrizeItem } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrize, deletePrize, getMyProfile, me, myPrizes, updatePrize } from '../api';
import { Prizes } from './Prizes';

vi.mock('../api', () => ({ me: vi.fn(), getMyProfile: vi.fn(), myPrizes: vi.fn(), createPrize: vi.fn(), updatePrize: vi.fn(), deletePrize: vi.fn() }));
vi.mock('../editor/ImageField', () => ({ ImageField: () => <div /> }));
vi.mock('../trophy/loadViewer', () => ({ loadViewer: vi.fn(async () => false), webglAvailable: () => false }));

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
  level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null } },
  likes: { author: 0, host: 0, player: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: profile });
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
  vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [item('p1', 'Кубок року'), item('p2', 'Піца', { status: 'reserved' })] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/prizes']}>
      <Routes>
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Prizes', () => {
  it('is the profile sub-page «Призи» with the won awards above the store', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Призи' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Назад' }).getAttribute('href')).toBe('/profile');
    expect(await screen.findByText('Нагород поки немає — їх вручають у іграх із призами.')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Нагороди', 'Мої призи']);
  });

  it('shows the won awards', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({
      ok: true,
      data: {
        ...profile,
        showcase: {
          title: null,
          pins: { prizes: [], achievements: [] },
          awards: [{ id: 'a1', place: 1, quizTitle: 'Столиці', nickname: 'Олена', awardedAt: '2026-10-30T10:00:00.000Z', content: { trophy: null, engraving: null, real: { text: 'Піца', photoUrl: null }, title: null, diploma: false } }],
        },
      },
    });
    open();
    expect(await screen.findByText('🎁 Піца')).toBeTruthy();
    expect(screen.queryByText('Нагород поки немає — їх вручають у іграх із призами.')).toBeNull();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('lists prizes; a reserved one says it is in a game and cannot be edited', async () => {
    open();
    expect(await screen.findByText('Кубок року')).toBeTruthy();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).not.toContain('У грі');
    expect(cards[1]!.textContent).toContain('У грі');
    expect(screen.getAllByRole('button', { name: 'Змінити' }).map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true]);
  });

  it('a prize reserved by a saved game says so', async () => {
    vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [item('p2', 'Піца', { status: 'reserved', inSavedGame: true })] });
    open();
    await screen.findByText('Піца');
    expect(screen.getByText('У збереженій грі')).toBeTruthy();
    expect(screen.queryByText('У грі')).toBeNull();
  });

  it('shows the empty text', async () => {
    vi.mocked(myPrizes).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText('Призів ще немає. Створи перший — і клади його на місця в лобі.')).toBeTruthy();
  });

  it('delete asks first, then removes the card', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: true });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Кубок року')).toBeNull());
    expect(deletePrize).toHaveBeenCalledWith('p1');
  });

  it('deleting the prize open in the editor closes the editor', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: true });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Змінити' })[0]!);
    expect(screen.getByLabelText('Назва')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    await waitFor(() => expect(screen.queryByLabelText('Назва')).toBeNull());
  });

  it('a refused delete shows the error and keeps the card', async () => {
    vi.mocked(deletePrize).mockResolvedValue({ ok: false, error: 'prize_in_game' });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Видалити' })[0]!);
    expect((await screen.findByRole('alert')).textContent).toBe('Приз лежить у грі — зніми його з місця, щоб змінити.');
    expect(screen.getByText('Кубок року')).toBeTruthy();
  });

  it('a new prize goes through the editor to createPrize and joins the list', async () => {
    vi.mocked(createPrize).mockResolvedValue({ ok: true, ...item('p3', 'Новий') });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getByRole('button', { name: 'Новий приз' }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Новий' } });
    fireEvent.click(screen.getByLabelText('Диплом'));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(createPrize).toHaveBeenCalledWith(content('Новий')));
    expect(await screen.findByText('Новий')).toBeTruthy();
  });

  it('edit saves through updatePrize', async () => {
    vi.mocked(updatePrize).mockResolvedValue({ ok: true, ...item('p1', 'Кубок 2') });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getAllByRole('button', { name: 'Змінити' })[0]!);
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Кубок 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(updatePrize).toHaveBeenCalledWith('p1', content('Кубок 2')));
    expect(await screen.findByText('Кубок 2')).toBeTruthy();
  });

  it('a save refused with invalid_payload and a reason shows a readable message', async () => {
    vi.mocked(createPrize).mockResolvedValue({ ok: false, error: 'invalid_payload:prize_empty' });
    open();
    await screen.findByText('Кубок року');
    fireEvent.click(screen.getByRole('button', { name: 'Новий приз' }));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Х' } });
    fireEvent.click(screen.getByLabelText('Диплом'));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toContain('Увімкни хоча б одну опцію.');
  });
});
