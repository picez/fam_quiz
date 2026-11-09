// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BetsInfo, BetsRow, PlayerBets } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import { BetForm, BetResult } from './BetsView';

afterEach(cleanup);

const info = (over: Partial<BetsInfo> = {}): BetsInfo => ({
  theme: 'Столиці',
  index: 0,
  total: 3,
  minimum: 200,
  maximum: null,
  teaser: 'Яке місто',
  bank: 0,
  placed: [],
  eligible: 2,
  rows: null,
  refund: false,
  ...over,
});

const mineOf = (over: Partial<PlayerBets> = {}): PlayerBets => ({ status: 'choosing', wager: null, minimum: 200, limit: 600, canBet: true, ...over });

const row = (over: Partial<BetsRow> = {}): BetsRow => ({ playerId: 'p1', nickname: 'Олена', wager: 200, grade: 'correct', points: 500, score: 1100, ...over });

describe('BetForm', () => {
  it('shows the number, the teaser and the range', () => {
    render(<BetForm bets={info()} mine={mineOf()} send={vi.fn()} />);
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
    expect(screen.getByText('Яке місто')).toBeTruthy();
    expect(screen.getByText('Ваша ставка від 200 до 600')).toBeTruthy();
    const field = screen.getByLabelText(t('finalWagerLabel')) as HTMLInputElement;
    expect(field.getAttribute('min')).toBe('200');
    expect(field.getAttribute('max')).toBe('600');
    expect(field.getAttribute('dir')).toBe('ltr');
  });

  it('places a bet', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<BetForm bets={info()} mine={mineOf()} send={send} />);
    const field = screen.getByLabelText(t('finalWagerLabel')) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:wager', { amount: 400 }));
    await waitFor(() => expect(screen.getByText('Ваша ставка: 400')).toBeTruthy());
    expect(field.value).toBe('400');
  });

  it("shows the server's reason", async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'bet_range' }));
    render(<BetForm bets={info()} mine={mineOf()} send={send} />);
    fireEvent.change(screen.getByLabelText(t('finalWagerLabel')), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    const status = await screen.findByText('Ставка має бути від мінімальної до найбільшої.');
    expect(status.getAttribute('role')).toBe('status');
    expect(screen.queryByText(/Ваша ставка: /)).toBeNull();
  });

  it('a double tap places one bet', async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    const send = vi.fn<Send>(() => new Promise((resolve) => (finish = resolve)));
    render(<BetForm bets={info()} mine={mineOf()} send={send} />);
    fireEvent.change(screen.getByLabelText(t('finalWagerLabel')), { target: { value: '300' } });
    const form = screen.getByRole('button', { name: 'Поставити' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(screen.getByText('Ваша ставка: 300')).toBeTruthy());
  });

  it('the minimum button fills the field', () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<BetForm bets={info({ index: 1, minimum: 300 })} mine={mineOf({ minimum: 300 })} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Мінімум' }));
    expect((screen.getByLabelText(t('finalWagerLabel')) as HTMLInputElement).value).toBe('300');
    expect(send).not.toHaveBeenCalled();
  });

  it('low points explain the skip without a field', () => {
    render(<BetForm bets={info()} mine={mineOf({ status: 'low', limit: 80, canBet: false })} send={vi.fn()} />);
    expect(screen.getByText('Ваших балів менше за мінімальну ставку 200 — це запитання ви пропускаєте')).toBeTruthy();
    expect(screen.queryByLabelText(t('finalWagerLabel'))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Поставити' })).toBeNull();
  });

  it('teaser-less question shows only the theme and number', () => {
    render(<BetForm bets={info({ teaser: '' })} mine={mineOf()} send={vi.fn()} />);
    expect(screen.queryByText(t('betsTeaserLabel'))).toBeNull();
    expect(screen.getByText('Столиці')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
  });
});

describe('BetResult', () => {
  const playing = mineOf({ status: 'playing', wager: 200, canBet: false });

  it('shows a win, a loss and a refund', () => {
    const { rerender } = render(<BetResult bets={info({ teaser: null, rows: [row()] })} mine={playing} playerId="p1" />);
    expect(screen.getByText('Ставка 200: +500 з банку')).toBeTruthy();
    rerender(<BetResult bets={info({ teaser: null, rows: [row({ grade: 'wrong', points: -200 })] })} mine={playing} playerId="p1" />);
    expect(screen.getByText('Ставка 200 пішла в банк')).toBeTruthy();
    rerender(<BetResult bets={info({ teaser: null, refund: true, rows: [row({ grade: 'wrong', points: 0 })] })} mine={playing} playerId="p1" />);
    expect(screen.getByText('Ніхто не відповів правильно — ставку повернуто')).toBeTruthy();
    rerender(<BetResult bets={info({ teaser: null, rows: [row({ points: 0 })] })} mine={playing} playerId="p1" />);
    expect(screen.getByText('Ставку збережено')).toBeTruthy();
  });

  it('a skipping player sees why', () => {
    const { rerender } = render(<BetResult bets={info({ teaser: null, rows: [] })} mine={mineOf({ status: 'late' })} playerId="p1" />);
    expect(screen.getByText('Ставки закрито без вашої — це запитання ви пропускаєте')).toBeTruthy();
    rerender(<BetResult bets={info({ teaser: null, rows: [] })} mine={mineOf({ status: 'low' })} playerId="p1" />);
    expect(screen.getByText('Ваших балів менше за мінімальну ставку 200 — це запитання ви пропускаєте')).toBeTruthy();
  });

  it('renders nothing before the reveal', () => {
    const { container } = render(<BetResult bets={info()} mine={mineOf({ status: 'playing' })} playerId="p1" />);
    expect(container.textContent).toBe('');
  });
});
