// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrizeItem } from '@quiz/shared';
import { gamePrizes, placePrizes } from '../api';
import { PrizePlaces } from './PrizePlaces';

vi.mock('../api', () => ({ gamePrizes: vi.fn(), placePrizes: vi.fn() }));

const item = (id: string, name: string): PrizeItem => ({
  id,
  status: 'free',
  createdAt: '2026-11-01T10:00:00.000Z',
  content: { name, trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false },
});
const options = [item('a', 'Головний приз'), item('b', 'Втішний приз')];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gamePrizes).mockResolvedValue({ ok: true, data: { options, places: [null, null, null] } });
});
afterEach(cleanup);

describe('PrizePlaces', () => {
  it('shows three selects with the prize names, a taken prize is disabled on the other places', async () => {
    render(<PrizePlaces code="123456" />);
    const first = (await screen.findByLabelText('1 місце')) as HTMLSelectElement;
    const second = screen.getByLabelText('2 місце') as HTMLSelectElement;
    expect(screen.getByLabelText('3 місце')).toBeTruthy();
    expect(Array.from(first.options).map((o) => o.textContent)).toEqual(['— без призу —', 'Головний приз', 'Втішний приз']);
    fireEvent.change(first, { target: { value: 'a' } });
    expect((Array.from(second.options).find((o) => o.value === 'a') as HTMLOptionElement).disabled).toBe(true);
    expect((Array.from(first.options).find((o) => o.value === 'a') as HTMLOptionElement).disabled).toBe(false);
  });

  it('puts the chosen prizes and takes the state from the answer', async () => {
    vi.mocked(placePrizes).mockResolvedValue({ ok: true, data: { options, places: ['a', null, null] } });
    render(<PrizePlaces code="123456" />);
    fireEvent.change(await screen.findByLabelText('1 місце'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Покласти призи' }));
    await waitFor(() => expect(placePrizes).toHaveBeenCalledWith('123456', ['a', null, null]));
    await screen.findByText('Призи покладено.');
  });

  it('shows the error text of a taken prize', async () => {
    vi.mocked(placePrizes).mockResolvedValue({ ok: false, error: 'prize_taken' });
    render(<PrizePlaces code="123456" />);
    fireEvent.change(await screen.findByLabelText('1 місце'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Покласти призи' }));
    await screen.findByText('Цей приз уже лежить в іншій грі.');
  });

  it('with an empty store says so and links to «Мої призи» in a new tab', async () => {
    vi.mocked(gamePrizes).mockResolvedValue({ ok: true, data: { options: [], places: [null, null, null] } });
    render(<PrizePlaces code="123456" />);
    await screen.findByText(/Призів ще немає/);
    const link = screen.getByRole('link', { name: 'Мої призи' });
    expect(link.getAttribute('href')).toBe('/prizes');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('for a host without an account shows a quiet line, no alert', async () => {
    vi.mocked(gamePrizes).mockResolvedValue({ ok: false, error: 'unauthorized' });
    render(<PrizePlaces code="123456" />);
    await screen.findByText('Увійдіть, щоб класти призи');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('for a missing room shows nothing', async () => {
    vi.mocked(gamePrizes).mockResolvedValue({ ok: false, error: 'not_found' });
    const { container } = render(<PrizePlaces code="123456" />);
    await waitFor(() => expect(gamePrizes).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('on another error shows the alert and retries on the button', async () => {
    vi.mocked(gamePrizes).mockResolvedValueOnce({ ok: false, error: 'offline' });
    render(<PrizePlaces code="123456" />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще' }));
    await screen.findByLabelText('1 місце');
    expect(gamePrizes).toHaveBeenCalledTimes(2);
  });
});
