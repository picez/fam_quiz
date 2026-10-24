// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
    expect(rows[0].textContent).toBe('Рим');
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
});
