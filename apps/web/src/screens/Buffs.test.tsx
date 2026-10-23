// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerActiveBuff, PlayerBuffs, PublicQuestion } from '@quiz/shared';
import type { Send } from '../live/types';
import { BuffRow, OvertimeLine, RetryPrompt } from './Buffs';

const NOW = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ready: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'ready', block: null },
    { kind: 'double', state: 'ready', block: null },
    { kind: 'shield', state: 'blocked', block: 'unfit_penalty' },
  ],
  active: null,
};

const active: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'active', block: null },
    { kind: 'double', state: 'blocked', block: 'taken' },
    { kind: 'shield', state: 'blocked', block: 'taken' },
  ],
  active: { kind: 'fifty', removed: ['a'], retry: null, first: null, hint: null, votes: null, spare: false },
};

const used: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'used', block: 'used' },
    { kind: 'double', state: 'used', block: 'used' },
    { kind: 'shield', state: 'used', block: 'used' },
  ],
  active: null,
};

const blocked: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'blocked', block: 'answered' },
    { kind: 'double', state: 'blocked', block: 'answered' },
    { kind: 'shield', state: 'blocked', block: 'answered' },
  ],
  active: null,
};

const question: PublicQuestion = {
  type: 'numeric',
  text: 'Скільки?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  choices: [],
  right: [],
  chain: null,
  sort: null,
  orderLabels: null,
};

const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;

function row(buffs: PlayerBuffs, over: { paused?: boolean; timeOver?: boolean; send?: Send } = {}) {
  const send = over.send ?? okSend();
  const onError = vi.fn();
  const result = render(<BuffRow buffs={buffs} paused={over.paused ?? false} timeOver={over.timeOver} send={send} onError={onError} />);
  return { send, onError, ...result };
}

const why = () => document.querySelector('.buff-why')!;

describe('Buffs', () => {
  it('the buff row keeps its size in every state', () => {
    const shapes = [ready, active, used, blocked].map((buffs) => {
      const { container, unmount } = row(buffs);
      const buttons = [...container.querySelectorAll('.buff-row button')];
      expect(container.querySelector('.buff-why')).not.toBeNull();
      const shape = { count: buttons.length, why: container.querySelectorAll('.buff-why').length };
      if (buffs === used || buffs === blocked) {
        for (const button of buttons) {
          expect(button.getAttribute('aria-disabled')).toBe('true');
          expect(button.hasAttribute('disabled')).toBe(false);
        }
      }
      unmount();
      return shape;
    });
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(shapes[0]).toEqual({ count: 3, why: 1 });
    // Порожній рядок пояснень однаково на місці.
    row(ready);
    expect(why().textContent).toBe('');
  });

  it('the used button is crossed out, the active one is marked and says it works', () => {
    row(active);
    expect(screen.getByRole('button', { name: '50/50' }).className).toContain('is-active');
    expect(why().textContent).toBe('½ 50/50: діє на цьому запитанні');
    cleanup();
    row(used);
    expect(screen.getByRole('button', { name: 'Щит' }).className).toContain('is-used');
  });

  it('two taps take a buff; one tap explains a blocked one', async () => {
    const { send } = row(ready);
    fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(why().textContent).toBe('Ще раз — узяти «50/50»');
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    });
    expect(send).toHaveBeenCalledWith('player:buff', { kind: 'fifty' });
    expect(send).toHaveBeenCalledTimes(1);
    cleanup();

    // Через 3 с підтвердження зникає: наступний дотик знову лише перший.
    const second = row(ready);
    fireEvent.click(screen.getByRole('button', { name: 'Подвійні бали' }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(why().textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Подвійні бали' }));
    expect(second.send).not.toHaveBeenCalled();
    expect(why().textContent).toBe('Ще раз — узяти «Подвійні бали»');

    // Дотик неактивної — причина, без надсилання.
    fireEvent.click(screen.getByRole('button', { name: 'Щит' }));
    expect(why().textContent).toBe('Щит не потрібен: у цьому раунді помилка не коштує балів.');
    fireEvent.click(screen.getByRole('button', { name: 'Щит' }));
    expect(second.send).not.toHaveBeenCalled();
    cleanup();

    // На паузі готові кнопки не шлють нічого.
    const paused = row(ready, { paused: true });
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(paused.send).not.toHaveBeenCalled();
    expect(why().textContent).toBe('Гру поставлено на паузу.');
    expect(screen.getByRole('button', { name: '50/50' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('a refused buff shows the server reason', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'buff_busy' })) as unknown as Send;
    const { onError } = row(ready, { send });
    fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    });
    expect(onError).toHaveBeenLastCalledWith('На це запитання баф уже взято.');
  });

  it('after the own deadline ready and unfit buttons say the time is over, used and taken stay', () => {
    const { send } = row(
      {
        slots: [
          { kind: 'fifty', state: 'ready', block: null },
          { kind: 'double', state: 'used', block: 'used' },
          { kind: 'shield', state: 'blocked', block: 'unfit_penalty' },
        ],
        active: null,
      },
      { timeOver: true },
    );
    expect(screen.getByRole('button', { name: '50/50' }).getAttribute('aria-disabled')).toBe('true');
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(send).not.toHaveBeenCalled();
    expect(why().textContent).toBe('Час вийшов.');
    fireEvent.click(screen.getByRole('button', { name: 'Щит' }));
    expect(why().textContent).toBe('Час вийшов.');
    fireEvent.click(screen.getByRole('button', { name: 'Подвійні бали' }));
    expect(why().textContent).toBe('Уже використано.');
  });

  it('retry prompt: again or keep / more', async () => {
    const send = okSend();
    const again: PlayerActiveBuff = { kind: 'retry', removed: [], retry: 'again', first: { answer: { type: 'numeric', value: 3 }, points: 0 }, hint: null, votes: null, spare: false };
    render(<RetryPrompt active={again} question={question} send={send} onError={vi.fn()} />);
    expect(screen.getByText('Неправильно, ще одна спроба')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();

    const choice: PlayerActiveBuff = { kind: 'retry', removed: [], retry: 'choice', first: { answer: { type: 'numeric', value: 42 }, points: 750 }, hint: null, votes: null, spare: false };
    render(<RetryPrompt active={choice} question={question} send={send} onError={vi.fn()} />);
    expect(screen.getByText(/Частково правильно: \+750\. Залишити чи ще спроба\?/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Залишити' }));
    });
    expect(send).toHaveBeenCalledWith('player:retry', { keep: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ще спроба' }));
    });
    expect(send).toHaveBeenCalledWith('player:retry', { keep: false });
    cleanup();

    // На паузі вибір чекає: обидві кнопки вимкнено.
    send.mockClear();
    render(<RetryPrompt active={choice} question={question} send={send} onError={vi.fn()} paused />);
    for (const name of ['Залишити', 'Ще спроба']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(send).not.toHaveBeenCalled();
    cleanup();

    const none = render(<RetryPrompt active={{ ...choice, retry: 'armed', first: null }} question={question} send={send} onError={vi.fn()} />);
    expect(none.container.firstChild).toBeNull();
  });

  it('overtime line counts down the personal deadline', () => {
    render(<OvertimeLine rows={[{ playerId: 'p2', nickname: 'Оля', deadline: NOW + 24_000, remainingMs: null }]} offsetMs={0} />);
    const line = screen.getByTitle('Чекаємо: Оля · 0:24');
    expect(line.getAttribute('aria-label')).toBe('Чекаємо: Оля · 0:24');
    // Вузький екран обрізає ім'я, а не відлік: час — окремий шматок, що не стискається.
    expect(line.querySelector('.buff-wait-names')?.textContent).toBe('Чекаємо: Оля');
    expect(line.querySelector('.buff-wait-time')?.textContent).toBe(' · 0:24');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTitle('Чекаємо: Оля · 0:23').textContent).toBe('Чекаємо: Оля · 0:23');
    cleanup();
    render(<OvertimeLine rows={[{ playerId: 'p2', nickname: 'Оля', deadline: null, remainingMs: 65_000 }]} offsetMs={0} />);
    expect(screen.getByTitle('Чекаємо: Оля · 1:05')).toBeTruthy();
    cleanup();
    const empty = render(<OvertimeLine rows={[]} offsetMs={0} />);
    expect(empty.container.firstChild).toBeNull();
  });

  it('several players with extra time share one line', () => {
    const { container } = render(
      <OvertimeLine
        rows={[
          { playerId: 'p2', nickname: 'Оля', deadline: NOW + 24_000, remainingMs: null },
          { playerId: 'p3', nickname: 'Петро', deadline: NOW + 12_000, remainingMs: null },
        ]}
        offsetMs={0}
      />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.textContent).toBe('Чекаємо: Оля · 0:24, Петро · 0:12');
    expect(container.querySelector('.buff-wait-time')?.textContent).toBe(' · 0:12');
  });

  it('the again prompt stands in the explanation line, not above the options', () => {
    row({ ...active, active: { kind: 'retry', removed: [], retry: 'again', first: { answer: null, points: 0 }, hint: null, votes: null, spare: false } });
    expect(why().textContent).toBe('Неправильно, ще одна спроба');
  });
});
