// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PrizeContent, PrizeItem } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrize, deletePrize, me, myPrizes, updatePrize } from '../api';
import { Prizes } from './Prizes';

vi.mock('../api', () => ({ me: vi.fn(), myPrizes: vi.fn(), createPrize: vi.fn(), updatePrize: vi.fn(), deletePrize: vi.fn() }));
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

beforeEach(() => {
  vi.clearAllMocks();
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
