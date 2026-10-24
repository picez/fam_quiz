// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BluffInfo, BluffOptionView } from '@quiz/shared';
import { BluffBoard } from './BluffBoard';

afterEach(cleanup);

const closed = (id: string, text: string): BluffOptionView => ({ id, text, open: false, kind: null, authors: null, pickedBy: null, removed: false });
const info = (options: BluffOptionView[], over: Partial<BluffInfo> = {}): BluffInfo => ({
  stage: 'reveal',
  written: 3,
  picked: 3,
  options,
  shown: options.filter((o) => o.open).length,
  total: options.length,
  lastOpenedId: null,
  lies: null,
  ...over,
});

describe('BluffBoard', () => {
  it('opened options show their kind, authors and buyers; closed ones only the text', () => {
    render(
      <BluffBoard
        info={info([
          closed('b1', 'Рим'),
          { id: 'b2', text: 'Мілан', open: true, kind: 'spare', authors: [], pickedBy: ['Оля'], removed: false },
          { id: 'b3', text: 'Париж', open: true, kind: 'lie', authors: ['Петро', 'Віра'], pickedBy: [], removed: false },
        ])}
      />,
    );
    expect(screen.getByText('Запасна вигадка ведучого')).toBeTruthy();
    expect(screen.getByText('Купилися: Оля')).toBeTruthy();
    expect(screen.getByText('Вигадка: Петро, Віра')).toBeTruthy();
    expect(screen.getByText('Ніхто не купився')).toBeTruthy();
    const rows = document.querySelectorAll('li.bluff-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].classList.contains('is-closed')).toBe(true);
    expect(rows[0].querySelector('.bluff-meta')).toBeNull();
    expect(rows[0].textContent).toBe('Римзакрито');
  });

  it('the opened truth is marked', () => {
    render(<BluffBoard info={info([{ id: 'b1', text: 'Рим', open: true, kind: 'truth', authors: [], pickedBy: ['Оля'], removed: false }], { lastOpenedId: 'b1' })} />);
    const row = document.querySelector('li.bluff-row')!;
    expect(row.classList.contains('is-truth')).toBe(true);
    expect(row.classList.contains('is-closed')).toBe(false);
    expect(screen.getByText('Правда')).toBeTruthy();
  });

  it('only the host sees removed options, marked', () => {
    const options = [closed('b1', 'Рим'), { ...closed('b2', 'Образа'), removed: true }];
    const { unmount } = render(<BluffBoard info={info(options)} host />);
    expect(screen.getByText('Прибрано')).toBeTruthy();
    expect(document.querySelector('li.is-removed')).not.toBeNull();
    unmount();
    render(<BluffBoard info={info(options)} />);
    expect(screen.queryByText('Образа')).toBeNull();
    expect(screen.queryByText('Прибрано')).toBeNull();
  });

  it('flips only the newly opened option, never on the first mount, and the flip ends', () => {
    vi.useFakeTimers();
    try {
      const open = (id: string, text: string): BluffOptionView => ({ id, text, open: true, kind: 'lie', authors: ['Оля'], pickedBy: [], removed: false });
      const before = info([open('b1', 'Рим'), closed('b2', 'Мілан')]);
      const { rerender } = render(<BluffBoard info={before} />);
      expect(document.querySelectorAll('.is-flipping')).toHaveLength(0);
      rerender(<BluffBoard info={info([open('b1', 'Рим'), open('b2', 'Мілан')])} />);
      const flipping = document.querySelectorAll('.is-flipping');
      expect(flipping).toHaveLength(1);
      expect(flipping[0].textContent).toContain('Мілан');
      // Нові дані до кінця анімації не залишають клас назавжди.
      rerender(<BluffBoard info={info([open('b1', 'Рим'), open('b2', 'Мілан')], { shown: 2, lastOpenedId: 'b2' })} />);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(document.querySelectorAll('.is-flipping')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closed options on the reveal have an accessible «закрито» state', () => {
    render(<BluffBoard info={info([closed('b1', 'Рим'), { id: 'b2', text: 'Правда', open: true, kind: 'truth', authors: [], pickedBy: [], removed: false }])} />);
    expect(screen.getAllByText('закрито')).toHaveLength(1);
  });
});
