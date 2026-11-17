// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DuelBets, DuelInfo, PlayerDuel } from '@quiz/shared';
import type { Send } from '../live/types';
import { DuelBet } from './DuelBet';

afterEach(cleanup);

const olya = { playerId: 'p1', nickname: 'Оля' };
const petro = { playerId: 'p2', nickname: 'Петро' };

const bets = (patch: Partial<DuelBets> = {}): DuelBets => ({ stake: 100, open: true, challenger: [], opponent: [], ...patch });

const duelInfo = (patch: Partial<DuelInfo> = {}): DuelInfo => ({
  challenger: olya,
  opponent: petro,
  stage: 'declared',
  categories: [{ id: 'dc1', title: 'Столиці', left: 3 }],
  category: null,
  number: 0,
  total: 3,
  question: null,
  accepted: null,
  wins: { challenger: 0, opponent: 0 },
  tries: { challenger: 0, opponent: 0 },
  questionWinner: null,
  winningAnswer: null,
  winner: null,
  stake: 300,
  bets: bets(),
  ending: false,
  ...patch,
});

type Bet = NonNullable<PlayerDuel['bet']>;

function show(duel: DuelInfo, bet: Bet = { side: null, can: true }, send: Send = vi.fn<Send>().mockResolvedValue({ ok: true }), paused = false) {
  const onError = vi.fn();
  const utils = render(<DuelBet duel={duel} bet={bet} paused={paused} send={send} onError={onError} />);
  return { ...utils, send, onError };
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('DuelBet', () => {
  it('two names and no bet', async () => {
    const { send } = show(duelInfo());
    expect(screen.getByText('На кого ставите?')).toBeTruthy();
    expect(screen.getByText('Ставка: 100')).toBeTruthy();
    expect(pressed('Оля')).toBe('false');
    expect(pressed('Петро')).toBe('false');
    expect(pressed('Без ставки')).toBe('true');
    expect(screen.queryByText('Ставить капітан за команду')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:duel-bet', { side: 'opponent' }));
  });

  it('the chosen side is pressed; «Без ставки» takes the bet back', async () => {
    const { send } = show(duelInfo(), { side: 'opponent', can: true });
    expect(pressed('Петро')).toBe('true');
    expect(pressed('Оля')).toBe('false');
    expect(pressed('Без ставки')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Без ставки' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:duel-bet', { side: null }));
  });

  it('without can the buttons are off; in a team the captain bets', () => {
    show(duelInfo(), { side: 'challenger', can: false });
    for (const name of ['Оля', 'Петро', 'Без ставки']) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(pressed('Оля')).toBe('true');
    expect(screen.getByText('Ставить капітан за команду')).toBeTruthy();
    cleanup();
    // Пауза: кнопки вимкнені, але це не «ставить капітан».
    show(duelInfo(), { side: null, can: false }, undefined, true);
    expect((screen.getByRole('button', { name: 'Оля' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Ставить капітан за команду')).toBeNull();
  });

  it('closed or off bets show nothing', () => {
    const { container, unmount } = show(duelInfo({ bets: bets({ open: false }) }));
    expect(container.innerHTML).toBe('');
    unmount();
    const off = show(duelInfo({ bets: null }));
    expect(off.container.innerHTML).toBe('');
  });

  it('a refused bet shows the reason', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error: 'duel_bets_closed' });
    const { onError } = show(duelInfo(), { side: null, can: true }, send);
    fireEvent.click(screen.getByRole('button', { name: 'Оля' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Ставки вже закрито — дуель почалася.'));
  });

  it('long names fit 320 px', () => {
    const long = (base: string) => base.repeat(10).slice(0, 30);
    show(duelInfo({ challenger: { playerId: 'p1', nickname: long('Олександра') }, opponent: { playerId: 'p2', nickname: long('Петро') } }));
    expect(screen.getByRole('button', { name: long('Олександра') })).toBeTruthy();
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    const rule = (selector: string) => {
      const start = css.indexOf(`\n${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    };
    // Два рівні стовпці, що не ширшають від імені; ім'я переноситься посеред слова, кнопка — на всю ширину стовпця.
    expect(rule('.duel-bet-sides')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    expect(rule('.duel-bet')).toMatch(/min-width:\s*0/);
    expect(rule('.duel-bet .btn')).toMatch(/width:\s*100%/);
    expect(rule('.duel-bet .btn')).toMatch(/min-width:\s*0/);
    expect(rule('.duel-bet .btn')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.duel-bet .btn')).toMatch(/white-space:\s*normal/);
  });
});
