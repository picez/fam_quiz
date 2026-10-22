// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChainInfo, PlayerChain, PublicQuestion } from '@quiz/shared';
import type { Send } from '../live/types';
import { ChainBoard, ChainPlay, ChainWords } from './ChainView';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const question: PublicQuestion = {
  type: 'chain',
  text: 'Ланцюжок',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  choices: [],
  right: [],
  chain: { first: 'Форель', masks: [['Р', null, null, null], ['О', null, null, null, null]], hintSeconds: 5 },
};

const chainOf = (over: Partial<PlayerChain> = {}): PlayerChain => ({
  solved: 0,
  masks: [['Р', null, null, null], ['О', null, null, null, null]],
  hints: 0,
  hintMs: 5000,
  canHint: true,
  deadline: Date.now() + 15_000,
  remainingMs: null,
  limitMs: 20_000,
  timeMs: null,
  ...over,
});

const play = (chain: PlayerChain, send: Send = vi.fn(async () => ({ ok: true as const }))) => {
  render(<ChainPlay chain={chain} question={question} paused={false} offsetMs={0} send={send} />);
  return send;
};

describe('ChainView', () => {
  it('shows the first word and masked words with blanks and separators', () => {
    render(<ChainWords first="Форель" masks={[['Р', null, null, null], ['Н', null, null, '-', null, null, null, null]]} />);
    expect(screen.getByLabelText('Форель')).toBeTruthy();
    expect(screen.getByLabelText('Р___')).toBeTruthy();
    expect(screen.getByLabelText('Н__-____')).toBeTruthy();
    expect(document.querySelector('.chain-sep')?.textContent).toBe('-');
    expect(document.querySelectorAll('.chain-cell.is-blank').length).toBe(9);
  });

  it('sends a guess, clears the field on success and shows a miss inline', async () => {
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce({ ok: false, error: 'wrong_word' })
      .mockResolvedValueOnce({ ok: true });
    play(chainOf(), send);
    const input = screen.getByLabelText('Наступне слово') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Сом' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити' }));
    expect(await screen.findByText('Не те слово. Спробуйте ще.')).toBeTruthy();
    expect(input.value).toBe('Сом');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(input, { target: { value: 'Риба' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити' }));
    await waitFor(() => expect(input.value).toBe(''));
    expect(send).toHaveBeenLastCalledWith('player:guess', { word: 'Риба' });
    expect(screen.queryByText('Не те слово. Спробуйте ще.')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('shows other errors as an alert', async () => {
    play(chainOf(), vi.fn(async () => ({ ok: false as const, error: 'hint_late' })));
    fireEvent.change(screen.getByLabelText('Наступне слово'), { target: { value: 'Риба' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити' }));
    expect((await screen.findByRole('alert')).textContent).toBe('На підказку вже не вистачає часу.');
  });

  it('the hint button sends player:hint and is off when no hint is left or time is short', () => {
    const { unmount } = render(<ChainPlay chain={chainOf({ canHint: false })} question={question} paused={false} offsetMs={0} send={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Підказка (+5 с)' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    const short = render(<ChainPlay chain={chainOf({ deadline: Date.now() + 3000 })} question={question} paused={false} offsetMs={0} send={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Підказка (+5 с)' }) as HTMLButtonElement).disabled).toBe(true);
    short.unmount();
    const send = play(chainOf());
    fireEvent.click(screen.getByRole('button', { name: 'Підказка (+5 с)' }));
    expect(send).toHaveBeenCalledWith('player:hint');
  });

  it('shows the own time counting up with the penalty', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    play(chainOf({ deadline: Date.now() + 15_000, limitMs: 20_000 }));
    expect(screen.getByText('Ваш час: 5,0 с')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Ваш час: 7,0 с')).toBeTruthy();
  });

  it('a finished chain shows the time and no form', () => {
    play(chainOf({ solved: 2, timeMs: 23_400, canHint: false, deadline: null }));
    expect(screen.getByRole('heading', { name: 'Ланцюжок пройдено за 23,4 с' })).toBeTruthy();
    expect(screen.queryByLabelText('Наступне слово')).toBeNull();
  });

  it('ranks players by time at the reveal with points', () => {
    const chain: ChainInfo = {
      total: 3,
      rows: [
        { playerId: 'p1', nickname: 'Олена', solved: 3, hints: 1, timeMs: 5000, points: 1000 },
        { playerId: 'p2', nickname: 'Тарас', solved: 1, hints: 0, timeMs: null, points: 0 },
      ],
    };
    render(<ChainBoard chain={chain} reveal />);
    const rows = document.querySelectorAll('.chain-board li');
    expect(rows[0].querySelector('.rank')?.textContent).toBe('1');
    expect(rows[0].textContent).toContain('Олена');
    expect(rows[0].textContent).toContain('5,0 с');
    expect(rows[0].textContent).toContain('підказок: 1');
    expect(rows[0].textContent).toContain('+1000');
    expect(rows[1].classList.contains('is-out')).toBe(true);
    expect(rows[1].textContent).toContain('1 з 3');
  });
});
