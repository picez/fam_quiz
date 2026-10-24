// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerWall, PublicQuestion, PublicWall } from '@quiz/shared';
import type { Send } from '../live/types';
import { WallInput } from './WallInput';

afterEach(cleanup);

const publicWall: PublicWall = { tiles: Array.from({ length: 16 }, (_, i) => `Т${i}`), size: 4, groupCount: 4, maxMistakes: 3 };
const question: PublicQuestion & { wall: PublicWall } = {
  type: 'wall',
  text: 'Стіна',
  imageUrl: null,
  video: null,
  timeLimit: 90,
  points: 1000,
  choices: [],
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, cloud: null, survey: null, audio: null, reveal: null,
  wall: publicWall,
};
const playerWall = (patch: Partial<PlayerWall> = {}): PlayerWall => ({
  found: [],
  mistakes: 0,
  maxMistakes: 3,
  locked: false,
  solved: false,
  canGuess: true,
  ...patch,
});

const okSend = () => vi.fn<Send>().mockResolvedValue({ ok: true });
const check = () => screen.queryByRole('button', { name: 'Перевірити' }) as HTMLButtonElement | null;
const tile = (i: number) => screen.getByRole('button', { name: `Т${i}` });
const pick = (...positions: number[]) => positions.forEach((i) => fireEvent.click(tile(i)));

describe('WallInput', () => {
  it('check is disabled until four tiles are picked; a fifth tap picks nothing', () => {
    render(<WallInput question={question} wall={playerWall()} paused={false} send={okSend()} />);
    expect(check()!.disabled).toBe(true);
    pick(1, 2, 3);
    expect(check()!.disabled).toBe(true);
    expect(screen.getByText('Вибрано 3 з 4')).toBeTruthy();
    pick(4, 5);
    expect(screen.getByText('Вибрано 4 з 4')).toBeTruthy();
    expect(tile(5).getAttribute('aria-pressed')).toBe('false');
    expect(check()!.disabled).toBe(false);
    pick(4);
    expect(check()!.disabled).toBe(true);
  });

  it('sends the picked positions', () => {
    const send = okSend();
    render(<WallInput question={question} wall={playerWall()} paused={false} send={send} />);
    pick(0, 5, 9, 14);
    fireEvent.click(check()!);
    expect(send).toHaveBeenCalledWith('player:wall', { tiles: [0, 5, 9, 14] });
  });

  it('a new mistake shakes the picked tiles and clears the pick', () => {
    const props = { question, paused: false, send: okSend() };
    const { rerender } = render(<WallInput {...props} wall={playerWall()} />);
    pick(0, 1, 2, 3);
    fireEvent.click(check()!);
    rerender(<WallInput {...props} wall={playerWall({ mistakes: 1 })} />);
    expect(document.querySelectorAll('.wall-tile.wall-shake')).toHaveLength(4);
    expect(document.querySelectorAll('.wall-tile.is-selected')).toHaveLength(0);
    expect(screen.getByText('Вибрано 0 з 4')).toBeTruthy();
    expect(screen.getByLabelText('Помилок: 1 з 3')).toBeTruthy();
  });

  it('a found group clears the pick and shows the colour', () => {
    const props = { question, paused: false, send: okSend() };
    const { rerender } = render(<WallInput {...props} wall={playerWall()} />);
    pick(0, 1, 2, 3);
    rerender(<WallInput {...props} wall={playerWall({ found: [{ tiles: [0, 1, 2, 3], color: 0 }] })} />);
    expect(document.querySelectorAll('.wall-tile.is-found.wall-color-0')).toHaveLength(4);
    expect(screen.getByText('Вибрано 0 з 4')).toBeTruthy();
  });

  it('locked and solved states have no check button', () => {
    const { unmount } = render(
      <WallInput question={question} wall={playerWall({ locked: true, mistakes: 3, found: [{ tiles: [0, 1, 2, 3], color: 0 }] })} paused={false} send={okSend()} />,
    );
    expect(screen.getByText('Стіну замкнено: помилки скінчилися. Знайдено груп: 1.')).toBeTruthy();
    expect(check()).toBeNull();
    unmount();
    render(<WallInput question={question} wall={playerWall({ solved: true })} paused={false} send={okSend()} />);
    expect(screen.getByText('Стіну складено! Останню групу склали за тебе.')).toBeTruthy();
    expect(check()).toBeNull();
  });

  it('wall_repeat shows the message and keeps the pick', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error: 'wall_repeat' });
    render(<WallInput question={question} wall={playerWall()} paused={false} send={send} />);
    pick(0, 1, 2, 3);
    await act(async () => {
      fireEvent.click(check()!);
    });
    expect(screen.getByText('Цей набір ти вже пробував.')).toBeTruthy();
    expect(screen.getByText('Вибрано 4 з 4')).toBeTruthy();
  });

  it('a pause disables the tiles and the check button', () => {
    render(<WallInput question={question} wall={playerWall()} paused send={okSend()} />);
    expect((tile(0) as HTMLButtonElement).disabled).toBe(true);
    expect(check()!.disabled).toBe(true);
  });

  it.each([
    ['wall_pick', 'Вибери плитки ще раз.'],
    ['time_over', 'Час на відповідь вийшов.'],
    ['already_answered', 'Ви вже відповіли на це запитання.'],
    ['paused', 'Гра на паузі.'],
  ])('server error %s is shown', async (error, text) => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error });
    render(<WallInput question={question} wall={playerWall()} paused={false} send={send} />);
    pick(0, 1, 2, 3);
    await act(async () => {
      fireEvent.click(check()!);
    });
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('a rejected send shows a message instead of hanging', async () => {
    const send = vi.fn<Send>().mockRejectedValue(new Error('offline'));
    render(<WallInput question={question} wall={playerWall()} paused={false} send={send} />);
    pick(0, 1, 2, 3);
    await act(async () => {
      fireEvent.click(check()!);
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(check()!.disabled).toBe(false);
  });

  it('the tiles are disabled when the wall is locked or the player cannot guess', () => {
    const { unmount } = render(<WallInput question={question} wall={playerWall({ canGuess: false })} paused={false} send={okSend()} />);
    expect((tile(0) as HTMLButtonElement).disabled).toBe(true);
    expect(check()!.disabled).toBe(true);
    unmount();
    render(<WallInput question={question} wall={playerWall({ locked: true, mistakes: 3 })} paused={false} send={okSend()} />);
    expect((tile(0) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the shake clears after its time and hits the last sent pick', () => {
    vi.useFakeTimers();
    try {
      const send = okSend();
      const props = { question, paused: false, send };
      const { rerender } = render(<WallInput {...props} wall={playerWall()} />);
      pick(0, 1, 2, 3);
      fireEvent.click(check()!);
      pick(7);
      rerender(<WallInput {...props} wall={playerWall({ mistakes: 1 })} />);
      const shaken = [...document.querySelectorAll('.wall-tile.wall-shake')].map((el) => el.textContent);
      expect(shaken).toEqual(['Т0', 'Т1', 'Т2', 'Т3']);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(document.querySelectorAll('.wall-tile.wall-shake')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
