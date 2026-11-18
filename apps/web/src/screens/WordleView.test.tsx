// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wordleMarks, type PlayerWordle, type WordleInfo, type WordleMark } from '@quiz/shared';
import type { Send } from '../live/types';
import { WordleBoard, WordleGrid, WordleOutcome, WordlePlay } from './WordleView';

afterEach(cleanup);

const letters = (word: string) => [...word];
const rowOf = (guess: string, target = 'колос') => ({ letters: letters(guess), marks: wordleMarks(letters(guess), letters(target)) });

const wordleOf = (over: Partial<PlayerWordle> = {}): PlayerWordle => ({ letters: 5, tries: 6, rows: [], solved: false, canGuess: true, word: null, ...over });

const ok = (): Send => vi.fn(async () => ({ ok: true as const }));

const play = (wordle: PlayerWordle, send: Send = ok(), { paused = false, readOnly = false } = {}) => {
  render(<WordlePlay wordle={wordle} paused={paused} readOnly={readOnly} send={send} />);
  return send;
};

const key = (name: string) => screen.getByRole('button', { name });
const press = (word: string) => {
  for (const letter of word) fireEvent.click(key(letter));
};
const typed = () => [...document.querySelectorAll('.wordle-row.is-current .wordle-cell')].map((cell) => cell.textContent).join('');

describe('WordleView (48)', () => {
  it('types a row on the keys and checks it', async () => {
    const send = play(wordleOf());
    const check = key('Перевірити') as HTMLButtonElement;
    press('сосн');
    expect(typed()).toBe('сосн');
    expect(check.disabled).toBe(true);
    press('а');
    expect(typed()).toBe('сосна');
    expect(check.disabled).toBe(false);
    // Шоста літера не додається.
    press('к');
    expect(typed()).toBe('сосна');
    fireEvent.click(key('Стерти літеру'));
    expect(typed()).toBe('сосн');
    expect(check.disabled).toBe(true);
    press('а');
    fireEvent.click(check);
    expect(send).toHaveBeenCalledWith('player:wordle', { word: 'сосна' });
    await waitFor(() => expect(typed()).toBe(''));
  });

  it('the top key row has 12 keys and the bottom row the erase and check keys', () => {
    play(wordleOf());
    const rows = [...document.querySelectorAll('.wordle-keys-row')];
    expect(rows.map((row) => row.querySelectorAll('button').length)).toEqual([12, 11, 10, 2]);
    expect(document.querySelector('.wordle-keys')?.getAttribute('dir')).toBe('ltr');
  });

  it('an error keeps the row and shows the text', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'wordle_unknown' }));
    play(wordleOf(), send);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    press('колба');
    fireEvent.click(key('Перевірити'));
    await waitFor(() => expect(status.textContent).toBe('Такого слова немає в словнику'));
    expect(typed()).toBe('колба');
    send.mockImplementation(async () => ({ ok: true }));
    fireEvent.click(key('Перевірити'));
    await waitFor(() => expect(typed()).toBe(''));
    expect(status.textContent).toBe('');
  });

  it('marks are shape and text, not only colour', () => {
    play(wordleOf({ rows: [rowOf('сосна')] }));
    // Ціль «колос», спроба «сосна»: near hit miss miss miss (друге «с» сіре).
    const cells = [...document.querySelectorAll('.wordle-row')][0].querySelectorAll('.wordle-cell');
    expect([...cells].map((cell) => cell.className)).toEqual(['wordle-cell is-near', 'wordle-cell is-hit', 'wordle-cell is-miss', 'wordle-cell is-miss', 'wordle-cell is-miss']);
    expect(cells[1].getAttribute('aria-label')).toBe('о — на місці');
    expect(cells[0].getAttribute('aria-label')).toBe('с — є в слові');
    expect(cells[2].getAttribute('aria-label')).toBe('с — немає');
    const legend = screen.getByRole('list', { name: 'Позначки' });
    for (const word of ['на місці', 'є в слові', 'немає']) expect(within(legend).getByText(word)).toBeTruthy();
    expect(legend.querySelectorAll('.wordle-cell.is-hit, .wordle-cell.is-near, .wordle-cell.is-miss').length).toBe(3);
  });

  it('keys show the best mark', () => {
    // «колос» проти цілі «сосна»: друге «о» сіре, але клавіша «о» лишається зеленою.
    play(wordleOf({ rows: [rowOf('колос', 'сосна'), rowOf('сосна', 'сосна')] }));
    expect(key('о — на місці').className).toContain('is-hit');
    expect(key('к — немає').className).toContain('is-miss');
    expect(key('й').className).not.toMatch(/is-(hit|near|miss)/);
  });

  it('repeated letters: the second «о» of «колос» against «сосна» is grey', () => {
    expect(rowOf('колос', 'сосна').marks).toEqual<WordleMark[]>(['miss', 'hit', 'miss', 'miss', 'near']);
  });

  it('physical keyboard works', async () => {
    const send = play(wordleOf());
    for (const letter of 'колос') fireEvent.keyDown(window, { key: letter });
    expect(typed()).toBe('колос');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(typed()).toBe('коло');
    fireEvent.keyDown(window, { key: 'С' });
    expect(typed()).toBe('колос');
    // Латиниця й Ctrl-комбінації не друкуються.
    fireEvent.keyDown(window, { key: 'q' });
    fireEvent.keyDown(window, { key: 'к', ctrlKey: true });
    expect(typed()).toBe('колос');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('player:wordle', { word: 'колос' });
    await waitFor(() => expect(typed()).toBe(''));
  });

  it('paused or out of time: keys are off and the physical keyboard does nothing', () => {
    play(wordleOf(), ok(), { paused: true });
    expect((key('к') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'к' });
    expect(typed()).toBe('');
  });

  it('read-only for a team member', () => {
    play(wordleOf({ rows: [rowOf('сосна')] }), ok(), { readOnly: true });
    expect(screen.queryByRole('button', { name: 'Перевірити' })).toBeNull();
    expect(document.querySelector('.wordle-keys')).toBeNull();
    expect(screen.getByText('Вгадує капітан — дивіться на сітку команди')).toBeTruthy();
    expect(screen.getByLabelText('о — на місці')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'к' });
    expect(document.querySelector('.wordle-row.is-current')).toBeNull();
  });

  it('solved and out of tries replace the keys with the outcome', () => {
    play(wordleOf({ rows: [rowOf('сосна'), rowOf('колос')], solved: true, canGuess: false }));
    expect(document.querySelector('.wordle-keys')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Вгадано з 2-ї спроби!');
    cleanup();
    play(wordleOf({ rows: Array.from({ length: 6 }, () => rowOf('сосна')), canGuess: false }));
    expect(screen.getByRole('status').textContent).toBe('Спроби скінчилися');
  });

  it('the grid has six rows of empty cells and an LTR direction', () => {
    const { container } = render(<WordleGrid letters={4} tries={6} rows={[]} current={['м']} />);
    const grid = container.querySelector('.wordle-grid');
    expect(grid?.getAttribute('dir')).toBe('ltr');
    expect(grid?.getAttribute('lang')).toBe('uk');
    expect(container.querySelectorAll('.wordle-row').length).toBe(6);
    expect(container.querySelectorAll('.wordle-cell').length).toBe(24);
  });

  it('the outcome shows the own grid and the word on reveal', () => {
    render(<WordleOutcome wordle={wordleOf({ rows: [rowOf('колос')], solved: true, canGuess: false, word: 'колос' })} />);
    expect(screen.getByRole('heading', { name: 'Вгадано з 1-ї спроби!' })).toBeTruthy();
    expect(screen.getByText('Слово: КОЛОС')).toBeTruthy();
    expect(screen.getByLabelText('к — на місці')).toBeTruthy();
    cleanup();
    render(<WordleOutcome wordle={wordleOf({ rows: Array.from({ length: 6 }, () => rowOf('сосна')), canGuess: false })} />);
    expect(screen.getByRole('heading', { name: 'Спроби скінчилися' })).toBeTruthy();
    expect(screen.queryByText(/Слово:/)).toBeNull();
    cleanup();
    render(<WordleOutcome wordle={wordleOf({ rows: [rowOf('сосна')], canGuess: false })} />);
    expect(screen.getByRole('heading', { name: 'Час вийшов' })).toBeTruthy();
  });

  const info = (over: Partial<WordleInfo> = {}): WordleInfo => ({
    letters: 5,
    tries: 6,
    word: null,
    rows: [
      { playerId: 'p1', nickname: 'Olena', marks: [rowOf('сосна').marks, rowOf('колос').marks], guesses: null, solved: true, tries: 2, points: null },
      { playerId: 'p2', nickname: 'Taras', marks: [rowOf('сосна').marks], guesses: null, solved: false, tries: 1, points: null },
    ],
    ...over,
  });

  it('stage grids have no letters before reveal', () => {
    const { container, unmount } = render(<WordleBoard info={info()} reveal={false} />);
    expect(container.textContent).not.toMatch(/[Ѐ-ӿ]/);
    expect(container.textContent).toContain('Olena');
    expect(container.querySelector('.wordle-cell.is-hit')?.getAttribute('aria-label')).toBe('на місці');
    expect(container.querySelector('.wordle-board.is-many')).toBeNull();
    unmount();
    const revealed = info({
      word: 'колос',
      rows: info().rows.map((row, index) => ({ ...row, guesses: index === 0 ? [letters('сосна'), letters('колос')] : [letters('сосна')], points: index === 0 ? 833 : 0 })),
    });
    render(<WordleBoard info={revealed} reveal />);
    expect(screen.getByText('КОЛОС')).toBeTruthy();
    expect(screen.getByText('Слово ведучого')).toBeTruthy();
    expect(screen.getAllByLabelText('к — на місці').length).toBeGreaterThan(0);
    expect(screen.getByText('вгадав за 2 спроби')).toBeTruthy();
    expect(screen.getByText('не вгадав')).toBeTruthy();
    expect(screen.getByText('+833')).toBeTruthy();
    cleanup();
    const many = Array.from({ length: 9 }, (_, n) => ({ ...info().rows[1], playerId: `p${n}`, nickname: `P${n}` }));
    const board = render(<WordleBoard info={info({ rows: many })} reveal={false} />);
    expect(board.container.querySelector('.wordle-board.is-many')).not.toBeNull();
  });

  it('the host board shows the letters live with tries', () => {
    render(<WordleBoard info={info({ word: 'колос', rows: [{ ...info().rows[1], guesses: [letters('сосна')] }] })} reveal={false} />);
    expect(screen.getByLabelText('о — на місці')).toBeTruthy();
    expect(screen.getByText('1 з 6')).toBeTruthy();
    // Слово ведучого пульт показує окремо («Слово: …»), не в дошці до розкриття.
    expect(screen.queryByText('КОЛОС')).toBeNull();
  });
});
