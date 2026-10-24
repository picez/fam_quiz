// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DuelInfo, GameAdjustment, Phase, PlayerDuel, PlayerView } from '@quiz/shared';
import { duelLines } from '../pages/GameHistory';
import type { Send, SendResult } from '../live/types';
import { DuelBanner, DuelButton, DuelPlay, duelScoreText, sideClass } from './DuelView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const olya = { playerId: 'p1', nickname: 'Оля' };
const petro = { playerId: 'p2', nickname: 'Петро' };
const ira = { playerId: 'p3', nickname: 'Іра' };

const duelInfo = (patch: Partial<DuelInfo> = {}): DuelInfo => ({
  challenger: olya,
  opponent: petro,
  stage: 'question',
  categories: [
    { id: 'dc1', title: 'Столиці', left: 3 },
    { id: 'dc2', title: 'Хімія', left: 0 },
  ],
  category: 'Столиці',
  number: 1,
  total: 3,
  question: 'Столиця Франції?',
  accepted: null,
  wins: { challenger: 0, opponent: 0 },
  tries: { challenger: 0, opponent: 0 },
  questionWinner: null,
  winningAnswer: null,
  winner: null,
  stake: 300,
  ending: false,
  ...patch,
});

const playerDuel = (patch: Partial<PlayerDuel> = {}): PlayerDuel => ({ rights: null, tries: [], canAnswer: false, canPick: false, ...patch });

const me = { id: 'p1', nickname: 'Оля', score: 0, rank: null, answer: null, result: null, blitz: null, final: null, chain: null, sort: null, debuff: null, shop: null, duel: playerDuel(), buffs: null, overtime: null, tip: null, vote: null, wall: null };

const view = (duel: DuelInfo, mine: Partial<PlayerDuel> = {}, id = 'p1'): PlayerView => ({
  role: 'player',
  phase: 'duel',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  final: null,
  chain: null,
  sort: null,
  wall: null,
  notice: null,
  buffs: [],
  buffNotice: null,
  debuffNotice: null,
  removed: [],
  splash: null,
  overtime: [],
  guide: null,
  newcomers: false,
  duel,
  round: null,
  questionIndex: 0,
  total: 3,
  question: null,
  endsAt: duel.stage === 'question' ? Date.now() + 20_000 : null,
  remainingMs: null,
  playerCount: 3,
  answeredCount: 0,
  limitMs: duel.stage === 'question' ? 30_000 : null,
  held: false,
  me: { ...me, id, duel: playerDuel(mine) },
  reveal: null,
  standings: null,
  table: null,
});

const okSend = () => vi.fn<Send>().mockResolvedValue({ ok: true });

function play(current: PlayerView, send: Send = okSend()) {
  const onError = vi.fn();
  const utils = render(<DuelPlay view={current} offsetMs={0} send={send} onError={onError} />);
  return { ...utils, send, onError };
}

describe('DuelView', () => {
  it('the score line names both duelists', () => {
    expect(duelScoreText(duelInfo({ wins: { challenger: 1, opponent: 0 } }))).toBe('Оля 1 : 0 Петро');
  });

  it('the duel button opens the opponent list and declares', async () => {
    const send = okSend();
    render(<DuelButton duel={playerDuel({ rights: { canDeclare: true, opponents: [petro, ira] } })} send={send} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '⚔ Дуель' }));
    const dialog = screen.getByRole('dialog', { name: 'Кого викликати на дуель?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Одна дуель за гру. Суперник не може відмовитися.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Іра' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeTruthy();
    // Фокус усередині діалогу.
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(send).toHaveBeenCalledWith('player:duel', { opponentId: 'p2' });
  });

  it('Escape and «Скасувати» close the dialog without declaring', () => {
    const send = okSend();
    render(<DuelButton duel={playerDuel({ rights: { canDeclare: true, opponents: [petro] } })} send={send} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '⚔ Дуель' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Escape діє й тоді, коли фокус уже не в діалозі.
    fireEvent.click(screen.getByRole('button', { name: '⚔ Дуель' }));
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '⚔ Дуель' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('a refused declaration shows the reason', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error: 'duel_busy' });
    const onError = vi.fn();
    render(<DuelButton duel={playerDuel({ rights: { canDeclare: true, opponents: [petro] } })} send={send} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: '⚔ Дуель' }));
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Зараз уже оголошено іншу дуель.'));
  });

  it('the button hides without rights and is disabled while another duel is declared', () => {
    const { rerender } = render(<DuelButton duel={playerDuel()} send={okSend()} onError={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<DuelButton duel={null} send={okSend()} onError={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<DuelButton duel={playerDuel({ rights: { canDeclare: false, opponents: [petro] } })} send={okSend()} onError={vi.fn()} />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: '⚔ Дуель' });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Зараз уже оголошено дуель');
  });

  it('the declared duel shows a fixed banner', () => {
    const { rerender, container } = render(<DuelBanner duel={duelInfo({ stage: 'declared' })} phase="question" />);
    const banner = container.querySelector('.duel-banner');
    expect(banner?.textContent).toBe('⚔ Дуель: Оля — Петро. Почнеться після цього запитання.');
    expect(banner?.getAttribute('role')).toBe('status');
    rerender(<DuelBanner duel={duelInfo({ stage: 'question' })} phase="duel" />);
    expect(container.querySelector('.duel-banner')).toBeNull();
    rerender(<DuelBanner duel={null} phase="question" />);
    expect(container.querySelector('.duel-banner')).toBeNull();
  });

  it('the banner says when the duel starts by the phase it was declared in', () => {
    const text = (phase: Phase) => {
      const { container, unmount } = render(<DuelBanner duel={duelInfo({ stage: 'declared' })} phase={phase} />);
      const content = container.querySelector('.duel-banner')?.textContent;
      unmount();
      return content;
    };
    expect(text('locked')).toBe('⚔ Дуель: Оля — Петро. Почнеться після цього запитання.');
    expect(text('board')).toBe('⚔ Дуель: Оля — Петро. Почнеться після наступного запитання.');
    for (const phase of ['intro', 'reveal', 'leaderboard', 'round_end'] as Phase[]) {
      expect(text(phase)).toBe('⚔ Дуель: Оля — Петро. Почнеться, щойно ведучий продовжить гру.');
    }
  });

  it('a long nickname on the stage gets a smaller font by its longest unbreakable piece', () => {
    expect(sideClass('is-challenger', 'Петро')).toBe('duel-stage-side is-challenger');
    expect(sideClass('is-challenger', 'Оля Петро Іра')).toBe('duel-stage-side is-challenger');
    // «Олександра-» з дефісом — 11 знаків: ще is-long.
    expect(sideClass('is-opponent', 'Олександра-Марійка К')).toBe('duel-stage-side is-opponent is-long');
    expect(sideClass('is-opponent', 'Олександр')).toBe('duel-stage-side is-opponent is-long');
    expect(sideClass('is-challenger', 'Найдовшеімʼяпідряд')).toBe('duel-stage-side is-challenger is-longer');
  });

  it('the challenger picks a category, the others wait', async () => {
    const category = duelInfo({ stage: 'category', category: null, number: 0, question: null });
    const { send } = play(view(category, { canPick: true }));
    expect(screen.getByText('Виберіть категорію')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Хімія · лишилося 0' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Столиці · лишилося 3' }));
    expect(send).toHaveBeenCalledWith('player:duel-category', { categoryId: 'dc1' });
    cleanup();

    // Подвійний дотик: поки вибір летить, другий не йде, кнопки вимкнені.
    let resolve: (result: SendResult) => void = () => {};
    const slow = vi.fn<Send>().mockImplementation(() => new Promise<SendResult>((r) => (resolve = r)));
    play(view(category, { canPick: true }), slow);
    const capitals = screen.getByRole<HTMLButtonElement>('button', { name: 'Столиці · лишилося 3' });
    fireEvent.click(capitals);
    fireEvent.click(capitals);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(capitals.disabled).toBe(true);
    await act(async () => resolve({ ok: true }));
    expect(capitals.disabled).toBe(false);
    cleanup();

    play(view(category, { canPick: false }, 'p2'));
    expect(screen.getByText('Оля вибирає категорію')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a duelist types answers until right; a wrong try stays listed', async () => {
    let resolve: (result: SendResult) => void = () => {};
    const send = vi.fn<Send>().mockImplementation(() => new Promise<SendResult>((r) => (resolve = r)));
    const current = view(duelInfo(), { canAnswer: true });
    const { rerender, onError } = play(current, send);
    expect(screen.getByText('Столиця Франції?')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    const input = screen.getByLabelText<HTMLInputElement>('Ваша відповідь');
    expect(input.closest('label')?.classList.contains('field')).toBe(true);
    fireEvent.change(input, { target: { value: 'Львів' } });
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:duel-answer', { text: 'Львів' });
    await act(async () => resolve({ ok: true }));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(onError).toHaveBeenLastCalledWith(null);

    rerender(<DuelPlay view={view(duelInfo({ tries: { challenger: 1, opponent: 0 } }), { canAnswer: true, tries: ['Львів'] })} offsetMs={0} send={send} onError={onError} />);
    expect(document.querySelector('.duel-tries')?.textContent).toContain('✗ Львів');
    cleanup();

    play(view(duelInfo(), { canAnswer: false }));
    expect(screen.getByLabelText<HTMLInputElement>('Ваша відповідь').disabled).toBe(true);
    const tries = document.querySelector('.duel-tries');
    expect(tries).not.toBeNull();
    expect(tries?.children).toHaveLength(0);
  });

  it('a category picked during the «Дуель!» splash keeps the answer field off until the splash ends', () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      const send = okSend();
      play({ ...view(duelInfo(), { canAnswer: true }), splash: { kind: 'duel', at: now - 500, until: now + 1500 } }, send);
      const input = screen.getByLabelText<HTMLInputElement>('Ваша відповідь');
      expect(input.disabled).toBe(true);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Відповісти' }).disabled).toBe(true);
      act(() => vi.advanceTimersByTime(1600));
      expect(input.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the challenger cannot blindly tap a category under the «Дуель!» splash, even with a phone clock off by minutes', () => {
    vi.useFakeTimers();
    try {
      // Годинник телефона відстає на 5 хв: offsetMs — сервер мінус пристрій.
      const offset = 300_000;
      const server = Date.now() + offset;
      const send = okSend();
      const category = duelInfo({ stage: 'category', category: null, number: 0, question: null });
      const onError = vi.fn();
      render(
        <DuelPlay view={{ ...view(category, { canPick: true }), splash: { kind: 'duel', at: server - 500, until: server + 1500 } }} offsetMs={offset} send={send} onError={onError} />,
      );
      const capitals = screen.getByRole<HTMLButtonElement>('button', { name: 'Столиці · лишилося 3' });
      expect(capitals.disabled).toBe(true);
      fireEvent.click(capitals);
      expect(send).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1600));
      expect(capitals.disabled).toBe(false);
      fireEvent.click(capitals);
      expect(send).toHaveBeenCalledWith('player:duel-category', { categoryId: 'dc1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('the duel button is off under a splash; an open dialog (above the splash) stays', () => {
    const duel = playerDuel({ rights: { canDeclare: true, opponents: [petro] } });
    const { rerender } = render(<DuelButton duel={duel} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '⚔ Дуель' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(<DuelButton duel={duel} paused send={okSend()} onError={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '⚔ Дуель' }).disabled).toBe(true);
  });

  it('spectators see the question, the clock and the score, not the tries', () => {
    play(view(duelInfo({ tries: { challenger: 0, opponent: 2 } }), {}, 'p3'));
    expect(screen.getByText('Столиця Франції?')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('Оля 0 : 0 Петро')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3 · Столиці')).toBeTruthy();
    expect(screen.getByText('Спроби: Оля 0 · Петро 2')).toBeTruthy();
    expect(screen.queryByLabelText('Ваша відповідь')).toBeNull();
    expect(document.querySelector('.duel-tries')).toBeNull();
  });

  it('the answer and the result', () => {
    const answered = { stage: 'answer' as const, accepted: ['Париж'], questionWinner: olya, winningAnswer: 'париж' };
    play(view(duelInfo(answered), {}, 'p3'));
    expect(screen.getByText('Правильна відповідь: Париж')).toBeTruthy();
    expect(screen.getByText('Це запитання виграє Оля: «париж»')).toBeTruthy();
    cleanup();

    play(view(duelInfo({ ...answered, questionWinner: null, winningAnswer: null }), {}, 'p3'));
    expect(screen.getByText('Ніхто не відповів правильно')).toBeTruthy();
    cleanup();

    const result = { stage: 'result' as const, question: null, wins: { challenger: 2, opponent: 1 } };
    play(view(duelInfo({ ...result, winner: olya })));
    expect(screen.getByText('Перемога в дуелі: Оля!')).toBeTruthy();
    expect(screen.getByText('Оля +300 · Петро −300')).toBeTruthy();
    cleanup();

    play(view(duelInfo({ ...result, winner: petro })));
    expect(screen.getByText('Петро +300 · Оля −300')).toBeTruthy();
    cleanup();

    play(view(duelInfo({ ...result, winner: null, wins: { challenger: 1, opponent: 1 } })));
    expect(screen.getByText('Нічия — бали не змінюються')).toBeTruthy();
    cleanup();

    play(view(duelInfo({ ...result, winner: olya, stake: 0 })));
    expect(screen.getByText('Без ставки — бали не змінюються')).toBeTruthy();
  });

  it('reduced motion: the banner does not pulse', () => {
    const { container, unmount } = render(<DuelBanner duel={duelInfo({ stage: 'declared' })} phase="question" />);
    expect(container.querySelector('.duel-banner')?.classList.contains('is-pulsing')).toBe(true);
    unmount();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    const calm = render(<DuelBanner duel={duelInfo({ stage: 'declared' })} phase="question" />);
    expect(calm.container.querySelector('.duel-banner')?.classList.contains('is-pulsing')).toBe(false);
  });
});

describe('duelLines', () => {
  it('duelLines pairs consecutive duel adjustments', () => {
    const row = (seq: number, nickname: string, points: number, source: GameAdjustment['source']): GameAdjustment => ({
      seq,
      roundIndex: 0,
      afterQuestion: 2,
      nickname,
      points,
      source,
    });
    expect(duelLines([row(1, 'Оля', 100, 'host'), row(2, 'Іра', 300, 'duel'), row(3, 'Оля', -300, 'duel'), row(5, 'Петро', 200, 'duel')])).toEqual([
      'Дуель: Іра +300, Оля −300',
      'Дуель: Петро +200',
    ]);
    // Сусідні +300 і −200 — не одна ставка: два окремі рядки.
    expect(duelLines([row(1, 'Іра', 300, 'duel'), row(2, 'Оля', -200, 'duel')])).toEqual(['Дуель: Іра +300', 'Дуель: Оля −200']);
  });
});
