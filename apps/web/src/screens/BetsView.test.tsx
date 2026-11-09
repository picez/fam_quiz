// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BetsInfo, BetsRow, PlayerBets } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import type { HostBets } from '@quiz/shared';
import { BetForm, BetResult, BetsResults, BetsStage, HostBetsPanel } from './BetsView';

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

  it('editing the field clears the previous reason', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'bet_range' }));
    render(<BetForm bets={info()} mine={mineOf()} send={send} />);
    fireEvent.change(screen.getByLabelText(t('finalWagerLabel')), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    await screen.findByText('Ставка має бути від мінімальної до найбільшої.');
    fireEvent.change(screen.getByLabelText(t('finalWagerLabel')), { target: { value: '300' } });
    expect(screen.queryByText('Ставка має бути від мінімальної до найбільшої.')).toBeNull();
  });

  it('a re-placed bet shows the new amount, not the old one', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<BetForm bets={info()} mine={mineOf({ status: 'placed', wager: 200 })} send={send} />);
    fireEvent.change(screen.getByLabelText(t('finalWagerLabel')), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    await waitFor(() => expect(screen.getByText('Ваша ставка: 500')).toBeTruthy());
  });

  it('a bet the server cut down shows the server amount', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const { rerender } = render(<BetForm bets={info()} mine={mineOf()} send={send} />);
    fireEvent.change(screen.getByLabelText(t('finalWagerLabel')), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    await waitFor(() => expect(screen.getByText('Ваша ставка: 500')).toBeTruthy());
    rerender(<BetForm bets={info()} mine={mineOf({ status: 'placed', wager: 500 })} send={send} />);
    expect(screen.getByText('Ваша ставка: 500')).toBeTruthy();
    // Ведучий зняв бали: межа 300, ставку зрізано.
    rerender(<BetForm bets={info()} mine={mineOf({ status: 'placed', wager: 300, limit: 300 })} send={send} />);
    expect(screen.getByText('Ваша ставка: 300')).toBeTruthy();
    expect(screen.queryByText('Ваша ставка: 500')).toBeNull();
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

describe('BetsStage', () => {
  const placed = [
    { playerId: 'p1', nickname: 'Олена' },
    { playerId: 'p2', nickname: 'Тарас' },
  ];

  it('shows the bank, who placed, the minimum and the maximum', () => {
    render(<BetsStage bets={info({ bank: 600, placed, maximum: 600 })} />);
    expect(screen.getByText('Банк: 600')).toBeTruthy();
    expect(screen.getByText('Поставили: Олена, Тарас')).toBeTruthy();
    expect(screen.getByText('Мінімальна ставка 200')).toBeTruthy();
    expect(screen.getByText('Найбільша ставка 600')).toBeTruthy();
    expect(screen.getByText('Яке місто')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
  });

  it('has no maximum line without a maximum, and says so when nobody placed', () => {
    render(<BetsStage bets={info({ bank: 0, placed: [] })} />);
    expect(screen.queryByText(/Найбільша ставка/)).toBeNull();
    expect(screen.getByText('Ще ніхто не поставив')).toBeTruthy();
  });

  it("never shows a single player's amount", () => {
    const { container } = render(<BetsStage bets={info({ bank: 600, placed })} />);
    expect(container.textContent).not.toContain('400');
  });
});

describe('BetsResults', () => {
  const players = [
    { id: 'p1', nickname: 'Олена' },
    { id: 'p2', nickname: 'Тарас' },
    { id: 'p3', nickname: 'Хосе' },
  ];
  const rows = [row({ wager: 400, points: 500 }), row({ playerId: 'p2', nickname: 'Тарас', wager: 200, grade: 'wrong', points: -200 })];

  it('lists the stake and the points of everyone who played', () => {
    const { container } = render(<BetsResults bets={info({ teaser: null, rows })} players={players} />);
    const lines = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(lines.some((line) => line?.includes('Олена') && line.includes('ставка 400') && line.includes('+500'))).toBe(true);
    expect(lines.some((line) => line?.includes('Тарас') && line.includes('ставка 200') && line.includes('−200'))).toBe(true);
    expect(container.querySelectorAll('[dir="ltr"]').length).toBeGreaterThan(0);
  });

  it('names the players who skipped', () => {
    render(<BetsResults bets={info({ teaser: null, rows })} players={players} />);
    expect(screen.getByText('Пропускають: Хосе')).toBeTruthy();
  });

  it('says the stakes were returned', () => {
    render(<BetsResults bets={info({ teaser: null, refund: true, rows })} players={players} />);
    expect(screen.getByText('Ніхто не відповів правильно — ставки повернуто')).toBeTruthy();
  });
});

describe('HostBetsPanel', () => {
  const question = { id: 'q1', type: 'text' as const, text: 'Яке місто є столицею Австралії', imageUrl: null, video: null, timeLimit: 20, points: 1000, accepted: ['Канберра'] };
  const host = (over: Partial<HostBets> = {}): HostBets => ({
    ...info({ placed: [{ playerId: 'p1', nickname: 'Олена' }], bank: 400 }),
    question,
    wagers: [
      { playerId: 'p1', nickname: 'Олена', wager: 400, limit: 600, canBet: true },
      { playerId: 'p2', nickname: 'Тарас', wager: null, limit: 500, canBet: true },
      { playerId: 'p3', nickname: 'Хосе', wager: null, limit: 80, canBet: false },
    ],
    manual: false,
    pending: [],
    ...over,
  });

  it('shows the full text, what the players see and every stake with its limit', () => {
    render(<HostBetsPanel bets={host()} send={vi.fn()} />);
    expect(document.querySelector('.bets-host-text')?.textContent).toBe('Яке місто є столицею Австралії');
    expect(screen.getByText('Гравці бачать: Яке місто')).toBeTruthy();
    const items = [...document.querySelectorAll('.wager-list li')].map((li) => li.textContent ?? '');
    expect(items[0]).toContain('400');
    expect(items[0]).toContain('до 600');
    expect(items[1]).toContain('ще думає');
    expect(items[2]).toContain('менше за мінімум');
  });

  it('opens the question with host:next', () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<HostBetsPanel bets={host()} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити запитання' }));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('can leave the open button to the footer', () => {
    render(<HostBetsPanel bets={host()} send={vi.fn()} openButton={false} />);
    expect(screen.queryByRole('button', { name: 'Відкрити запитання' })).toBeNull();
  });

  it('shows a rejected grading through onError', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'wrong_phase' }));
    const onError = vi.fn();
    const pending = [{ playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Канберра' } }];
    render(<HostBetsPanel bets={host({ teaser: null, manual: true, pending })} send={send} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: t('finalGradeWrong') }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/\S/)));
  });

  it('grades pending manual answers', () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const pending = [{ playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Канберра' } }];
    render(<HostBetsPanel bets={host({ teaser: null, manual: true, pending })} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: t('finalGradeCorrect') }));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
    expect(screen.queryByRole('button', { name: 'Відкрити запитання' })).toBeNull();
  });
});
