// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuctionInfo, HostAuction, PlayerAuction } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import { AuctionHeader, AuctionResult, AuctionResults, AuctionStage, AuctionStrip, BidForm, HostAuctionPanel } from './AuctionView';

afterEach(cleanup);

const info = (over: Partial<AuctionInfo> = {}): AuctionInfo => ({
  theme: 'Столиці',
  index: 0,
  total: 3,
  price: 200,
  mode: 'step',
  step: 100,
  loss: 'bid',
  teaser: 'Яке місто',
  bid: 200,
  leader: { playerId: 'p1', nickname: 'Олена' },
  next: 300,
  endsAt: Date.now() + 5000,
  remainingMs: null,
  totalMs: 5000,
  open: false,
  result: null,
  ...over,
});

const mineOf = (over: Partial<PlayerAuction> = {}): PlayerAuction => ({ status: 'bidding', limit: 600, next: 300, canBid: true, ...over });

/** Після продажу: тексту немає, ставка — за скільки продано. */
const sold = (over: Partial<AuctionInfo> = {}) => info({ teaser: null, next: 0, endsAt: null, bid: 400, ...over });

describe('AuctionHeader', () => {
  it('shows the theme, price, top bid and the clock', () => {
    render(<AuctionHeader auction={info()} offsetMs={0} />);
    expect(screen.getByText('Столиці')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
    expect(screen.getByText('Ціна запитання: 200')).toBeTruthy();
    expect(screen.getByText('Яке місто')).toBeTruthy();
    expect(screen.getByText('Найбільша ставка: 200 — Олена')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('says nobody bid yet', () => {
    render(<AuctionHeader auction={info({ bid: 0, leader: null, next: 100, totalMs: 15000 })} offsetMs={0} />);
    expect(screen.getByText('Ставок ще немає')).toBeTruthy();
  });
});

describe('BidForm', () => {
  it('a step bid sends the exact next amount', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<BidForm auction={info()} mine={mineOf()} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поставити 300' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:wager', { amount: 300 }));
  });

  it('a step button is off when the player cannot bid', () => {
    render(<BidForm auction={info()} mine={mineOf({ canBid: false })} send={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Поставити 300' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a free bid sends the typed amount and shows the server's reason", async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'bid_over' }));
    render(<BidForm auction={info({ mode: 'free', next: 201 })} mine={mineOf({ next: 201 })} send={send} />);
    const field = screen.getByLabelText(t('auctionBidLabel')) as HTMLInputElement;
    expect(field.getAttribute('min')).toBe('201');
    expect(field.getAttribute('max')).toBe('600');
    expect(field.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText('Від 201 до 600')).toBeTruthy();
    fireEvent.change(field, { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Поставити' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:wager', { amount: 900 }));
    const status = await screen.findByText('Більше за свої бали поставити не можна.');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.className).toContain('auction-error');
    fireEvent.change(field, { target: { value: '500' } });
    expect(screen.queryByText('Більше за свої бали поставити не можна.')).toBeNull();
  });

  it('a closed auction says the bidding is over', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'time_over' }));
    render(<BidForm auction={info()} mine={mineOf()} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Поставити 300' }));
    expect(await screen.findByText('Торг уже закрито.')).toBeTruthy();
  });

  it("a rival's bid keeps the typed amount", () => {
    const { rerender } = render(<BidForm auction={info({ mode: 'free', next: 201 })} mine={mineOf({ next: 201 })} send={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(t('auctionBidLabel')), { target: { value: '450' } });
    rerender(<BidForm auction={info({ mode: 'free', bid: 300, next: 301, leader: { playerId: 'p2', nickname: 'Тарас' } })} mine={mineOf({ next: 301 })} send={vi.fn()} />);
    expect((screen.getByLabelText(t('auctionBidLabel')) as HTMLInputElement).value).toBe('450');
  });

  it('a double tap places one bid', async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    const send = vi.fn<Send>(() => new Promise((resolve) => (finish = resolve)));
    render(<BidForm auction={info()} mine={mineOf()} send={send} />);
    const button = screen.getByRole('button', { name: 'Поставити 300' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('the leader, the short and the zero see a line, not a button', () => {
    const { rerender } = render(<BidForm auction={info()} mine={mineOf({ status: 'leading', canBid: false })} send={vi.fn()} />);
    expect(screen.getByText('Ваша ставка найбільша')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<BidForm auction={info()} mine={mineOf({ status: 'short', limit: 250, canBid: false })} send={vi.fn()} />);
    expect(screen.getByText('Більше за ваші бали (250) поставити не можна')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<BidForm auction={info()} mine={mineOf({ status: 'none', limit: 0, canBid: false })} send={vi.fn()} />);
    expect(screen.getByText(t('auctionNone'))).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('AuctionResult', () => {
  it('after the sale the phone says who answers', () => {
    const { rerender } = render(<AuctionResult auction={sold()} mine={mineOf({ status: 'winner', canBid: false })} />);
    expect(screen.getByText('Ви купили запитання за 400 — відповідайте!')).toBeTruthy();
    rerender(<AuctionResult auction={sold()} mine={mineOf({ status: 'watching', canBid: false })} />);
    expect(screen.getByText('Відповідає Олена — запитання куплено за 400')).toBeTruthy();
    rerender(<AuctionResult auction={sold({ bid: 0, leader: null, open: true })} mine={mineOf({ status: 'open', canBid: false })} />);
    expect(screen.getByText('Ніхто не купив — відповідають усі')).toBeTruthy();
  });

  it("the result shows the winner's points", () => {
    const { rerender } = render(<AuctionResult auction={sold({ result: { grade: 'correct', points: 600 } })} mine={mineOf({ status: 'watching', canBid: false })} />);
    expect(screen.getByText('Правильно: +600')).toBeTruthy();
    rerender(<AuctionResult auction={sold({ result: { grade: 'wrong', points: -400 } })} mine={mineOf({ status: 'watching', canBid: false })} />);
    expect(screen.getByText('Помилка: −400')).toBeTruthy();
  });

  it('renders nothing while bidding', () => {
    const { container } = render(<AuctionResult auction={info()} mine={mineOf()} />);
    expect(container.textContent).toBe('');
  });
});

describe('the stage', () => {
  it('the stage hides the rest and shows the sale', () => {
    const { container, unmount } = render(<AuctionStage auction={info()} offsetMs={0} />);
    expect(container.textContent).not.toContain('Австралії');
    expect(screen.getByText('Яке місто')).toBeTruthy();
    expect(screen.getByText('Ціна запитання: 200')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    unmount();
    render(<AuctionStrip auction={sold()} />);
    expect(screen.getByText('Продано: Олена за 400')).toBeTruthy();
  });

  it('an unsold strip says everyone answers', () => {
    render(<AuctionStrip auction={sold({ bid: 0, leader: null, open: true })} />);
    expect(screen.getByText('Ніхто не купив — відповідають усі')).toBeTruthy();
  });

  it('the results row shows the winner, the bid, the mark and the points', () => {
    const { container } = render(<AuctionResults auction={sold({ result: { grade: 'wrong', points: -400 } })} />);
    const line = container.querySelector('li')?.textContent ?? '';
    expect(line).toContain('Олена');
    expect(line).toContain('400');
    expect(line).toContain('✗');
    expect(line).toContain('−400');
  });

  it('the results row is empty for an unsold question', () => {
    const { container } = render(<AuctionResults auction={sold({ bid: 0, leader: null, open: true })} />);
    expect(container.textContent).toBe('');
  });
});

describe('HostAuctionPanel', () => {
  const question = { id: 'q1', type: 'text' as const, text: 'Яке місто є столицею Австралії', imageUrl: null, video: null, timeLimit: 25, points: 200, accepted: ['Канберра'] };
  const host = (over: Partial<HostAuction> = {}): HostAuction => ({
    ...info(),
    question,
    limits: [
      { playerId: 'p1', nickname: 'Олена', limit: 600, canBid: false },
      { playerId: 'p2', nickname: 'Тарас', limit: 500, canBid: true },
      { playerId: 'p3', nickname: 'Хосе', limit: 80, canBid: false },
    ],
    manual: false,
    pending: [],
    ...over,
  });

  it('the host sells', () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<HostAuctionPanel auction={host()} send={send} />);
    expect(document.querySelector('.auction-host-text')?.textContent).toBe('Яке місто є столицею Австралії');
    expect(screen.getByText('Гравці бачать: Яке місто')).toBeTruthy();
    const items = [...document.querySelectorAll('.auction-limits li')].map((li) => li.textContent ?? '');
    expect(items[1]).toContain('бали 500');
    expect(items[2]).toContain('Хосе');
    expect(items[2]).toContain('не може перебити');
    fireEvent.click(screen.getByRole('button', { name: 'Продано' }));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('can leave the sell button to the footer', () => {
    render(<HostAuctionPanel auction={host()} send={vi.fn()} sellButton={false} />);
    expect(screen.queryByRole('button', { name: 'Продано' })).toBeNull();
  });

  it("grades the winner's manual answer", () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const pending = [{ playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Канберра' } }];
    render(<HostAuctionPanel auction={host({ teaser: null, next: 0, endsAt: null, bid: 400, manual: true, pending })} send={send} />);
    expect(screen.queryByRole('button', { name: 'Продано' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('finalGradeCorrect') }));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
  });
});
