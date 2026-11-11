// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { generateSudoku, type PlayerPuzzle, type PublicPuzzle, type PublicQuestion, type PuzzleBoardView, type PuzzleInfo } from '@quiz/shared';
import type { Send, SendResult } from '../live/types';
import { PUZZLE_FLUSH_MS } from '../live/usePuzzleBoard';
import { sudokuPeers } from '../live/sudoku-pencil';
import { CrosswordPlay, PUZZLE_PAGE_MS, PUZZLE_TAP_GAP_MS, PuzzleBoards, PuzzleHistoryGrid, PuzzleReveal, SudokuPlay, puzzleGrid, puzzlePageSize, wordFilled } from './PuzzleView';

const base: Omit<PublicQuestion, 'type' | 'puzzle'> = {
  text: 'Розв’яжіть',
  imageUrl: null,
  video: null,
  timeLimit: 180,
  points: 300,
  choices: [],
  right: [],
  orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  chain: null,
  sort: null,
};

const { givens, solution } = generateSudoku(7, 'easy');
const sudoku: PublicQuestion = { ...base, type: 'sudoku', puzzle: { kind: 'sudoku', givens } };
const givenAt = givens.split('').findIndex((ch) => ch !== '0');
const emptyAt = givens.split('').findIndex((ch) => ch === '0');

/**
 * Кросворд 3×4: «лис» по горизонталі з (0,0), «липа» по вертикалі з (0,0); ключ — у режимі key клітинки 2 і 9.
 *   л и с
 *   и # #
 *   п # #
 *   а # #
 */
const crosswordPuzzle: Extract<PublicPuzzle, { kind: 'crossword' }> = {
  kind: 'crossword',
  mode: 'key',
  width: 3,
  height: 4,
  mask: '111100100100',
  words: [
    { number: 1, row: 0, col: 0, dir: 'across', length: 3, clue: 'Руда хитрунка' },
    { number: 1, row: 0, col: 0, dir: 'down', length: 4, clue: 'Дерево з запашним цвітом' },
  ],
  keyCells: [2, 9],
};
const crossword: PublicQuestion = { ...base, type: 'crossword', timeLimit: 240, puzzle: crosswordPuzzle };

const mineOf = (size: number, over: Partial<PlayerPuzzle> = {}): PlayerPuzzle => ({
  cells: new Array<string>(size).fill(''),
  mask: '0'.repeat(size),
  members: [],
  done: false,
  canEdit: true,
  seq: 0,
  result: null,
  ...over,
});

function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at](result)) };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const cell = (row: number, col: number) => screen.getByRole('button', { name: new RegExp(`^Рядок ${row}, стовпець ${col}\\b`) });
const sudokuCell = (i: number) => cell(Math.floor(i / 6) + 1, (i % 6) + 1);
const crosswordCell = (i: number) => cell(Math.floor(i / 3) + 1, (i % 3) + 1);
const input = () => document.querySelector<HTMLInputElement>('.crossword-input')!;
const typeIn = (text: string) => fireEvent.change(input(), { target: { value: input().value + text } });
const active = () => document.querySelector('.crossword-active')?.textContent ?? '';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SudokuPlay', () => {
  it('a given digit cannot be selected', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<SudokuPlay info={mineOf(36)} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={send} />);
    // Задана цифра — не кнопка: її не вибрати й не змінити.
    expect(screen.queryByRole('button', { name: new RegExp(`^Рядок ${Math.floor(givenAt / 6) + 1}, стовпець ${(givenAt % 6) + 1}\\b`) })).toBeNull();
    const given = document.querySelectorAll('.sudoku-cell')[givenAt];
    expect(given.classList.contains('is-given')).toBe(true);
    expect(given.textContent).toBe(givens[givenAt]);
    fireEvent.click(given);
    expect(document.querySelector('.sudoku-cell.is-selected')).toBeNull();
    // Без вибраної клітинки клавіатура нічого не пише.
    expect(screen.getByRole('button', { name: '1' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    wait(PUZZLE_FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it('the keypad fills the selected cell', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<SudokuPlay info={mineOf(36)} question={sudoku} questionIndex={2} paused={false} timeUp={false} send={send} />);
    fireEvent.click(sudokuCell(emptyAt));
    expect(sudokuCell(emptyAt).getAttribute('aria-pressed')).toBe('true');
    // Рядок, стовпець і блок вибраної клітинки підсвічено.
    expect(document.querySelectorAll('.sudoku-cell.is-peer').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(sudokuCell(emptyAt).textContent).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Стерти' }));
    expect(sudokuCell(emptyAt).textContent).toBe('');
    // Фізична клавіатура: цифра, стрілка, Backspace.
    fireEvent.keyDown(window, { key: '6' });
    expect(sudokuCell(emptyAt).textContent).toBe('6');
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledWith('player:puzzle', { questionIndex: 2, cells: [{ i: emptyAt, v: '6' }] });
    fireEvent.keyDown(window, { key: '9' });
    expect(sudokuCell(emptyAt).textContent).toBe('6');
    // Правильності до кінця немає.
    expect(document.querySelector('.is-wrong, .is-right')).toBeNull();
  });

  it('pause and the end of time turn the grid off', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    const { rerender } = render(<SudokuPlay info={mineOf(36)} question={sudoku} questionIndex={0} paused timeUp={false} send={send} />);
    expect(document.querySelector('.puzzle-play.is-off')).not.toBeNull();
    fireEvent.click(sudokuCell(emptyAt));
    expect(sudokuCell(emptyAt).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Готово' }).getAttribute('aria-disabled')).toBe('true');
    rerender(<SudokuPlay info={mineOf(36)} question={sudoku} questionIndex={0} paused={false} timeUp send={send} />);
    expect(document.querySelector('.puzzle-play.is-off')).not.toBeNull();
    expect(screen.getByText('Час вийшов — сітку зафіксовано.')).toBeTruthy();
    fireEvent.click(sudokuCell(emptyAt));
    fireEvent.keyDown(window, { key: '3' });
    wait(PUZZLE_FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
    rerender(<SudokuPlay info={mineOf(36, { done: true, canEdit: false })} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={send} />);
    expect(screen.getByText('Розв’язання зафіксовано. Чекаємо інших')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Готово' })).toBeNull();
  });

  it('done asks to confirm', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    render(<SudokuPlay info={mineOf(36)} question={sudoku} questionIndex={1} paused={false} timeUp={false} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.getByText('Зафіксувати розв’язання? Змінити вже не вийде.')).toBeTruthy();
    // Другий дотик подвійного натиску не підтверджує.
    fireEvent.click(screen.getByRole('button', { name: 'Так, зафіксувати' }));
    expect(send).not.toHaveBeenCalled();
    // «Ще ні» повертає кнопку.
    fireEvent.click(screen.getByRole('button', { name: 'Ще ні' }));
    expect(screen.queryByText('Зафіксувати розв’язання? Змінити вже не вийде.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    wait(PUZZLE_TAP_GAP_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Так, зафіксувати' }));
    fireEvent.click(screen.getByRole('button', { name: 'Так, зафіксувати' }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:puzzle-done', { questionIndex: 1 });
    await answer({ ok: true });
  });

  it('teammates see who filled each cell', () => {
    const cells = new Array<string>(36).fill('');
    cells[emptyAt] = '2';
    const mask = givens.split('').map((ch, i) => (ch !== '0' ? 'g' : i === emptyAt ? '2' : '0')).join('');
    const members = [{ id: 'u1', nickname: 'Олена', tone: 1 }, { id: 'u3', nickname: 'Тарас', tone: 3 }];
    const gone = empties.find((i) => i !== emptyAt)!;
    cells[gone] = '4';
    const marked = [...mask].map((ch, i) => (i === gone ? 'x' : i === emptyAt ? '3' : ch)).join('');
    render(<SudokuPlay info={mineOf(36, { cells, mask: marked, members })} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    // Колір — tone учасника з сервера (місце в команді на відкритті), а не позиція в легенді.
    expect(sudokuCell(emptyAt).classList.contains('by-3')).toBe(true);
    expect(screen.getByText('Тарас').closest('li')?.querySelector('.by-3')).not.toBeNull();
    // Учасника вже немає: окрема позначка, не колір 9-го.
    expect(sudokuCell(gone).classList.contains('by-x')).toBe(true);
  });
});

describe('sudoku pencil', () => {
  // Дві порожні клітинки, що бачать одна одну (рядок, стовпець чи блок), і порожня клітинка поза їхніми лініями.
  const empties = givens.split('').flatMap((ch, i) => (ch === '0' ? [i] : []));
  const a = empties[0];
  const b = empties.find((i) => i !== a && sudokuPeers(a).includes(i))!;
  const far = empties.find((i) => i !== a && i !== b && !sudokuPeers(a).includes(i) && !sudokuPeers(b).includes(i));
  const notes = (i: number) => [...(sudokuCell(i).querySelectorAll('.sudoku-pencil > span') as NodeListOf<HTMLElement>)].map((el) => el.textContent).join('');
  const pencilButton = () => screen.getByRole('button', { name: 'Олівець' });
  const key = (digit: string) => fireEvent.click(screen.getByRole('button', { name: digit }));
  const mount = (over: Partial<Parameters<typeof SudokuPlay>[0]> = {}, send: Send = vi.fn<Send>()) =>
    render(<SudokuPlay info={mineOf(36)} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={send} {...over} />);

  it('the pencil toggles small candidates in an empty cell', () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>();
    mount({}, send);
    fireEvent.click(sudokuCell(a));
    expect(pencilButton().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pencilButton());
    expect(pencilButton().getAttribute('aria-pressed')).toBe('true');
    key('1');
    key('3');
    expect(sudokuCell(a).querySelector('.sudoku-pencil')).not.toBeNull();
    expect(notes(a)).toBe('13');
    expect(sudokuCell(a).getAttribute('aria-label')).toContain('позначки: 1, 3');
    // Цифра d стоїть на місці d − 1 сітки 2×3.
    expect(sudokuCell(a).querySelectorAll('.sudoku-pencil > span')).toHaveLength(6);
    expect(sudokuCell(a).querySelectorAll('.sudoku-pencil > span')[2].textContent).toBe('3');
    key('3');
    expect(notes(a)).toBe('1');
    wait(PUZZLE_FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it('a written digit hides the marks of its cell and removes it from peers', () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(sudokuCell(a));
    fireEvent.click(pencilButton());
    key('1');
    key('3');
    fireEvent.click(sudokuCell(b));
    key('3');
    key('2');
    fireEvent.click(pencilButton());
    expect(pencilButton().getAttribute('aria-pressed')).toBe('false');
    key('3');
    expect(sudokuCell(b).textContent).toBe('3');
    expect(sudokuCell(b).querySelector('.sudoku-pencil')).toBeNull();
    expect(notes(a)).toBe('1');
    // Стерта цифра позначок не повертає.
    fireEvent.click(screen.getByRole('button', { name: 'Стерти' }));
    expect(sudokuCell(b).textContent).toBe('');
    expect(notes(a)).toBe('1');
  });

  it("a teammate's digit removes the marks of its cell and that digit from its row, column and box", () => {
    vi.useFakeTimers();
    const info = (cells: string[], seq: number) => mineOf(36, { cells, seq, members: [{ id: 'p1', nickname: 'Я', tone: 1 }, { id: 'p2', nickname: 'Він', tone: 2 }] });
    const send = vi.fn<Send>();
    const view = mount({ info: info(new Array<string>(36).fill(''), 0) }, send);
    fireEvent.click(sudokuCell(a));
    fireEvent.click(pencilButton());
    key('3');
    key('4');
    fireEvent.click(sudokuCell(b));
    key('3');
    key('5');
    if (far !== undefined) {
      fireEvent.click(sudokuCell(far));
      key('3');
    }
    const cells = new Array<string>(36).fill('');
    cells[b] = '3';
    view.rerender(<SudokuPlay info={info(cells, 1)} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={send} />);
    expect(sudokuCell(b).querySelector('.sudoku-pencil')).toBeNull();
    expect(notes(a)).toBe('4');
    if (far !== undefined) expect(notes(far)).toBe('3');
    view.rerender(<SudokuPlay info={info(new Array<string>(36).fill(''), 2)} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={send} />);
    expect(notes(a)).toBe('4');
    expect(sudokuCell(b).querySelector('.sudoku-pencil')).toBeNull();
  });

  it('marks survive a remount for the same question and are gone for another', () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const pencil = { room: 'ABCD', round: 0 };
    const first = mount({ pencil });
    fireEvent.click(sudokuCell(a));
    fireEvent.click(pencilButton());
    key('2');
    first.unmount();
    mount({ pencil });
    expect(notes(a)).toBe('2');
    cleanup();
    mount({ pencil, questionIndex: 1 });
    expect(sudokuCell(a).querySelector('.sudoku-pencil')).toBeNull();
    cleanup();
    const other = { ...sudoku, puzzle: { kind: 'sudoku' as const, givens: givens.replace('0', '1') } };
    mount({ pencil, question: other });
    expect(document.querySelector('.sudoku-pencil')).toBeNull();
    sessionStorage.clear();
  });

  it('erase in pencil mode clears the marks of the cell', () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(sudokuCell(a));
    fireEvent.click(pencilButton());
    key('1');
    key('2');
    fireEvent.click(screen.getByRole('button', { name: 'Стерти' }));
    expect(sudokuCell(a).querySelector('.sudoku-pencil')).toBeNull();
  });

  it('digits in pencil mode do nothing on a filled cell', () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>();
    mount({}, send);
    fireEvent.click(sudokuCell(a));
    key('4');
    fireEvent.click(pencilButton());
    key('2');
    expect(sudokuCell(a).textContent).toBe('4');
    expect(sudokuCell(a).querySelector('.sudoku-pencil')).toBeNull();
    fireEvent.keyDown(window, { key: '5' });
    expect(sudokuCell(a).textContent).toBe('4');
  });
});

describe('CrosswordPlay', () => {
  it('typing jumps to the next cell of the word', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={4} paused={false} timeUp={false} send={send} />);
    // Системна клавіатура: прихований input без автокорекції й великих літер.
    expect(input().getAttribute('autocapitalize')).toBe('none');
    expect(input().getAttribute('autocorrect')).toBe('off');
    fireEvent.click(crosswordCell(0));
    expect(document.activeElement).toBe(input());
    expect(active()).toBe('1 → Руда хитрунка');
    typeIn('Л');
    expect(crosswordCell(0).textContent).toContain('л');
    expect(crosswordCell(1).getAttribute('aria-pressed')).toBe('true');
    typeIn('ис');
    expect(crosswordCell(2).textContent).toContain('с');
    // Кінець слова — на наступне незаповнене слово, на першу порожню клітинку.
    expect(crosswordCell(3).getAttribute('aria-pressed')).toBe('true');
    expect(active()).toBe('1 ↓ Дерево з запашним цвітом');
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledWith('player:puzzle', { questionIndex: 4, cells: [{ i: 0, v: 'л' }, { i: 1, v: 'и' }, { i: 2, v: 'с' }] });
    // Backspace (символ-заглушку стерто) у порожній клітинці відступає й стирає попередню.
    fireEvent.change(input(), { target: { value: '' } });
    expect(crosswordCell(0).getAttribute('aria-pressed')).toBe('true');
    expect(crosswordCell(0).textContent).not.toContain('л');
    // «Стерти» стирає вибрану клітинку.
    typeIn('л');
    fireEvent.click(crosswordCell(1));
    expect(crosswordCell(1).textContent).toContain('и');
    fireEvent.click(screen.getByRole('button', { name: 'Стерти' }));
    expect(crosswordCell(1).textContent).not.toContain('и');
  });

  it('a keyboard composition writes each letter once, at its end; a replaced placeholder writes, not erases', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={0} paused={false} timeUp={false} send={send} />);
    fireEvent.click(crosswordCell(0));
    // Клавіатура з передбаченням тримає композицію: проміжні значення поля нічого не пишуть.
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: '​л' } });
    fireEvent.change(input(), { target: { value: '​ли' } });
    expect(crosswordCell(0).textContent).not.toContain('л');
    fireEvent.compositionEnd(input(), { data: 'ли' });
    expect(crosswordCell(0).textContent).toContain('л');
    expect(crosswordCell(1).textContent).toContain('и');
    expect(crosswordCell(2).getAttribute('aria-pressed')).toBe('true');
    // Після композиції поле знову — лише заглушка: подія input, що йде слідом, нічого не дописує.
    expect(input().value).toBe('​');
    fireEvent.change(input(), { target: { value: '​' } });
    expect(crosswordCell(2).textContent).not.toContain('и');
    // Клавіатура замінила заглушку літерою: це вписування, а не стирання.
    fireEvent.change(input(), { target: { value: 'с' } });
    expect(crosswordCell(2).textContent).toContain('с');
    expect(crosswordCell(1).textContent).toContain('и');
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledWith('player:puzzle', { questionIndex: 0, cells: [{ i: 0, v: 'л' }, { i: 1, v: 'и' }, { i: 2, v: 'с' }] });
  });

  it('a second tap on a crossing turns the direction', () => {
    render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    fireEvent.click(crosswordCell(0));
    expect(active()).toBe('1 → Руда хитрунка');
    expect(document.querySelectorAll('.crossword-play-cell.is-word')).toHaveLength(3);
    fireEvent.click(crosswordCell(0));
    expect(active()).toBe('1 ↓ Дерево з запашним цвітом');
    expect(document.querySelectorAll('.crossword-play-cell.is-word')).toHaveLength(4);
    // Клітинка лише одного слова: повторний дотик напрямку не міняє.
    fireEvent.click(crosswordCell(6));
    fireEvent.click(crosswordCell(6));
    expect(active()).toBe('1 ↓ Дерево з запашним цвітом');
    // Підказка зі списку вибирає слово й першу порожню клітинку.
    fireEvent.click(screen.getByRole('button', { name: /Руда хитрунка/ }));
    expect(active()).toBe('1 → Руда хитрунка');
    expect(crosswordCell(0).getAttribute('aria-pressed')).toBe('true');
  });

  it('apostrophes and latin letters are ignored', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={0} paused={false} timeUp={false} send={send} />);
    fireEvent.click(crosswordCell(0));
    for (const ch of ["'", 'ʼ', '’', 'a', 'L', '1', ' ']) typeIn(ch);
    expect(crosswordCell(0).getAttribute('aria-pressed')).toBe('true');
    expect(crosswordCell(0).textContent).toBe('1');
    wait(PUZZLE_FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
    // ґ — окрема літера.
    typeIn('ґ');
    expect(crosswordCell(0).textContent).toContain('ґ');
  });

  it('the key strip shows the key cells and selects them', () => {
    const cells = new Array<string>(12).fill('');
    cells[2] = 'с';
    render(<CrosswordPlay info={mineOf(12, { cells })} question={crossword} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    const strip = [...document.querySelectorAll('.crossword-key button')];
    expect(strip.map((b) => b.textContent)).toEqual(['с', '']);
    expect(crosswordCell(2).classList.contains('is-key')).toBe(true);
    fireEvent.click(strip[1]);
    expect(crosswordCell(9).getAttribute('aria-pressed')).toBe('true');
    expect(active()).toBe('1 ↓ Дерево з запашним цвітом');
  });

  it('the end of time turns the grid and the typing off', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={0} paused={false} timeUp send={send} />);
    expect(document.querySelector('.puzzle-play.is-off')).not.toBeNull();
    expect(input().disabled).toBe(true);
    fireEvent.click(crosswordCell(0));
    expect(crosswordCell(0).getAttribute('aria-pressed')).toBe('false');
    typeIn('л');
    wait(PUZZLE_FLUSH_MS);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('crossword filled clues', () => {
  const clueBtn = (re: RegExp) => screen.getByText(re, { selector: 'button.crossword-clue' });
  const filled = () => [...document.querySelectorAll('.crossword-clue.is-filled')].map((b) => b.textContent);

  it('wordFilled', () => {
    expect(wordFilled([0, 1, 2], ['а', 'б', 'в'])).toBe(true);
    expect(wordFilled([0, 1, 2], ['а', '', 'в'])).toBe(false);
  });

  it('a clue whose cells are all filled is struck through, and plain again after an erase', () => {
    vi.useFakeTimers();
    render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    fireEvent.click(crosswordCell(0));
    typeIn('лис');
    // Курсор перейшов на слово 2; слово 1 заповнене.
    fireEvent.click(crosswordCell(2));
    fireEvent.click(crosswordCell(0));
    expect(active()).toContain('Руда хитрунка');
    expect(document.querySelector('.crossword-active')!.classList.contains('is-filled')).toBe(true);
    expect(clueBtn(/Руда хитрунка/).classList.contains('is-filled')).toBe(true);
    expect(clueBtn(/Дерево з запашним цвітом/).classList.contains('is-filled')).toBe(false);
    fireEvent.click(crosswordCell(2));
    fireEvent.click(screen.getByRole('button', { name: 'Стерти' }));
    expect(clueBtn(/Руда хитрунка/).classList.contains('is-filled')).toBe(false);
    expect(document.querySelector('.crossword-active')!.classList.contains('is-filled')).toBe(false);
  });

  it("a teammate's letters count too", () => {
    const view = render(<CrosswordPlay info={mineOf(12)} question={crossword} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    expect(filled()).toEqual([]);
    const cells = new Array<string>(12).fill('');
    cells[0] = 'л';
    cells[3] = 'и';
    cells[6] = 'п';
    cells[9] = 'а';
    view.rerender(<CrosswordPlay info={mineOf(12, { cells, seq: 1 })} question={crossword} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    expect(clueBtn(/Дерево з запашним цвітом/).classList.contains('is-filled')).toBe(true);
  });

  it('filled says nothing about right or wrong', () => {
    const cells = ['х', 'х', 'х', '', '', '', '', '', '', '', '', ''];
    render(<CrosswordPlay info={mineOf(12, { cells })} question={crossword} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} />);
    expect(clueBtn(/Руда хитрунка/).className).toBe('crossword-clue is-filled');
  });
});

describe('PuzzleReveal', () => {
  it('marks the wrong cells and shows the solution', () => {
    const cells = new Array<string>(36).fill('');
    cells[emptyAt] = solution[emptyAt] === '1' ? '2' : '1';
    const mine = mineOf(36, { cells, done: true, canEdit: false, result: { solved: false, wrong: [emptyAt], points: 0 } });
    render(<PuzzleReveal mine={mine} question={sudoku} solution={solution.split('').map((ch, i) => (givens[i] === '0' ? ch : ''))} />);
    expect(screen.getByText('Ваша сітка')).toBeTruthy();
    expect(screen.getByText('Правильний розв’язок')).toBeTruthy();
    const yours = document.querySelectorAll('.puzzle-reveal-grid')[0].querySelectorAll('.sudoku-cell');
    expect(yours[emptyAt].classList.contains('is-wrong')).toBe(true);
    const right = document.querySelectorAll('.puzzle-reveal-grid')[1].querySelectorAll('.sudoku-cell');
    expect([...right].map((c) => c.textContent).join('')).toBe(solution);
  });
});

const sudokuSolution = solution.split('').map((ch, i) => (givens[i] === '0' ? ch : ''));
const empties = givens.split('').flatMap((ch, i) => (ch === '0' ? [i] : []));
const boardOf = (over: Partial<PuzzleBoardView> = {}): PuzzleBoardView => ({
  playerId: 'p1',
  nickname: 'Олена',
  mask: givens.split('').map((ch) => (ch === '0' ? '0' : 'g')).join(''),
  tone: 1,
  members: [],
  filled: 0,
  total: empties.length,
  done: false,
  last: null,
  cells: null,
  solved: null,
  points: null,
  ...over,
});
/** Маска з вписаними клітинками at (хто — by). */
const maskWith = (at: number[], by = '1') => givens.split('').map((ch, i) => (ch !== '0' ? 'g' : at.includes(i) ? by : '0')).join('');

describe('PuzzleBoards', () => {
  it('the stage draws masks without values', () => {
    const info: PuzzleInfo = {
      kind: 'sudoku',
      boards: [boardOf({ mask: maskWith(empties.slice(0, 3)), filled: 3, last: empties[2] }), boardOf({ playerId: 'p2', nickname: 'Тарас', done: true })],
      solution: null,
    };
    render(<PuzzleBoards info={info} puzzle={sudoku.puzzle!} reveal={false} />);
    expect(document.querySelectorAll('.puzzle-thumb')).toHaveLength(2);
    const cells = [...document.querySelectorAll('.puzzle-thumb-cell')];
    expect(cells).toHaveLength(72);
    // Жодної цифри: ні вписаних, ні заданих.
    expect(cells.map((c) => c.textContent).join('')).toBe('');
    const first = document.querySelectorAll('.puzzle-thumb')[0];
    expect(first.querySelectorAll('.puzzle-thumb-cell.is-filled')).toHaveLength(3);
    expect(first.querySelectorAll('.puzzle-thumb-cell.is-given')).toHaveLength(36 - empties.length);
    expect(first.querySelectorAll('.puzzle-thumb-cell')[empties[2]].classList.contains('is-last')).toBe(true);
    expect(screen.getByText(`3 / ${empties.length}`)).toBeTruthy();
    // «Готово» — лише в Тараса.
    expect(document.querySelectorAll('.puzzle-thumb-done')).toHaveLength(1);
    expect(document.querySelectorAll('.puzzle-thumb')[1].querySelector('.puzzle-thumb-done')).not.toBeNull();
  });

  it('a team grid colours each cell by its filler and names the members', () => {
    const mask = givens.split('').map((ch, i) => (ch !== '0' ? 'g' : i === empties[0] ? '1' : i === empties[1] ? '2' : '0')).join('');
    const members = [{ id: 'u2', nickname: 'Оля', tone: 1 }, { id: 'u3', nickname: 'Петро', tone: 2 }];
    const info: PuzzleInfo = { kind: 'sudoku', boards: [boardOf({ playerId: 'team-b', nickname: 'Сині', mask, filled: 2, tone: 0, members })], solution: null };
    render(<PuzzleBoards info={info} puzzle={sudoku.puzzle!} reveal={false} />);
    const cells = document.querySelectorAll('.puzzle-thumb-cell');
    expect(cells[empties[0]].classList.contains('by-1')).toBe(true);
    expect(cells[empties[1]].classList.contains('by-2')).toBe(true);
    expect(screen.getByText('Оля').classList.contains('by-1')).toBe(true);
    expect(screen.getByText('Петро').classList.contains('by-2')).toBe(true);
  });

  it('many boards share the stage: denser columns, two pages over 40', () => {
    expect(puzzleGrid(4, false)).toEqual({ cols: 4, rows: 1, dense: false });
    const g24 = puzzleGrid(24, false);
    expect(g24.cols * g24.rows).toBeGreaterThanOrEqual(24);
    expect(g24.cols).toBeGreaterThanOrEqual(6);
    expect(g24.dense).toBe(false);
    const g40 = puzzleGrid(40, false);
    expect(g40).toMatchObject({ cols: 10, rows: 4, dense: true });
    expect(puzzleGrid(24, true)).toMatchObject({ cols: 6, rows: 4, dense: true });
    vi.useFakeTimers();
    const boards = Array.from({ length: 45 }, (_, n) => boardOf({ playerId: `p${n}`, nickname: `Гравець ${n + 1}` }));
    render(<PuzzleBoards info={{ kind: 'sudoku', boards, solution: null }} puzzle={sudoku.puzzle!} reveal={false} />);
    // Сторінки рівні: 45 = 23 + 22, а не 40 + 5.
    expect(document.querySelectorAll('.puzzle-thumb')).toHaveLength(23);
    expect(screen.getByText('Гравець 1')).toBeTruthy();
    act(() => vi.advanceTimersByTime(PUZZLE_PAGE_MS));
    expect(document.querySelectorAll('.puzzle-thumb')).toHaveLength(22);
    expect(screen.getByText('Гравець 45')).toBeTruthy();
    expect(puzzlePageSize(40, false)).toBe(40);
    expect(puzzlePageSize(41, false)).toBe(21);
    expect(puzzlePageSize(81, false)).toBe(27);
    expect(puzzlePageSize(24, true)).toBe(24);
    expect(puzzlePageSize(25, true)).toBe(13);
  });

  it('a solo colour comes from the board, the same on every page', () => {
    vi.useFakeTimers();
    const boards = Array.from({ length: 42 }, (_, n) => boardOf({ playerId: `p${n}`, nickname: `Гравець ${n + 1}`, tone: (n % 9) + 1 }));
    render(<PuzzleBoards info={{ kind: 'sudoku', boards, solution: null }} puzzle={sudoku.puzzle!} reveal={false} />);
    const toneOf = (name: string) => [...(screen.getByText(name).closest('li')?.classList ?? [])].find((c) => c.startsWith('by-'));
    expect(toneOf('Гравець 1')).toBe('by-1');
    act(() => vi.advanceTimersByTime(PUZZLE_PAGE_MS));
    expect(toneOf('Гравець 22')).toBe(`by-${(21 % 9) + 1}`);
    expect(toneOf('Гравець 42')).toBe(`by-${(41 % 9) + 1}`);
  });

  it('the host sees the values live', () => {
    const cells = new Array<string>(36).fill('');
    cells[empties[0]] = sudokuSolution[empties[0]];
    const info: PuzzleInfo = { kind: 'sudoku', boards: [boardOf({ mask: maskWith([empties[0]]), filled: 1, cells })], solution: sudokuSolution };
    render(<PuzzleBoards info={info} puzzle={sudoku.puzzle!} reveal={false} host />);
    const shown = document.querySelectorAll('.puzzle-thumb-cell');
    expect(shown[empties[0]].textContent).toBe(sudokuSolution[empties[0]]);
    expect(shown[givenAt].textContent).toBe(givens[givenAt]);
    // До кінця часу ведучий правильності клітинок не бачить позначками.
    expect(document.querySelector('.puzzle-thumb-cell.is-wrong')).toBeNull();
  });
});

describe('PuzzleHistoryGrid', () => {
  const layoutQ = {
    id: 'cw', type: 'crossword' as const, text: 'Кросворд', imageUrl: null, video: null, timeLimit: 240, points: 300, mode: 'key' as const,
    entries: [{ id: 'a', answer: 'лис', clue: 'Руда хитрунка' }, { id: 'b', answer: 'липа', clue: 'Дерево' }],
    key: 'спа',
    layout: { width: 3, height: 4, words: [{ id: 'a', row: 0, col: 0, dir: 'across' as const }, { id: 'b', row: 0, col: 0, dir: 'down' as const }], keyCells: [2, 6, 9] },
  };

  it('shows the final grid compactly, the key word and «done»', () => {
    const answer = { type: 'puzzle' as const, kind: 'crossword' as const, grid: 'лис' + 'и##' + 'п##' + 'а##', filled: 6, total: 6, solved: true, done: true };
    render(<PuzzleHistoryGrid answer={answer} question={layoutQ} playerKey="спа" />);
    expect([...document.querySelectorAll('.puzzle-history-grid .puzzle-thumb-cell')].map((c) => c.textContent).join('')).toBe('лисипа');
    expect(document.querySelectorAll('.puzzle-history-grid .is-block')).toHaveLength(6);
    expect(screen.getByText('СПА')).toBeTruthy();
    expect(screen.getByText('Готово ✓')).toBeTruthy();
  });

  it('a sudoku grid keeps the givens and marks empty cells', () => {
    const grid = givens.split('').map((ch, i) => (ch !== '0' ? ch : i === emptyAt ? solution[i] : '0')).join('');
    const q = { id: 's', type: 'sudoku' as const, text: 'С', imageUrl: null, video: null, timeLimit: 180, points: 300, level: 'easy' as const, seed: 7, givens, solution };
    render(<PuzzleHistoryGrid answer={{ type: 'puzzle', kind: 'sudoku', grid, filled: 1, total: empties.length, solved: false }} question={q} />);
    const cells = document.querySelectorAll('.puzzle-history-grid .puzzle-thumb-cell');
    expect(cells[emptyAt].textContent).toBe(solution[emptyAt]);
    expect(cells[givenAt].classList.contains('is-given')).toBe(true);
    expect(cells[empties[1]].textContent).toBe('');
    expect(screen.queryByText('Готово ✓')).toBeNull();
  });
});

describe('puzzle styles', () => {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  const start = css.indexOf('/* Головоломки: телефон (28d)');
  const section = css.slice(start, css.indexOf('/* Головоломки: кінець телефона */'));

  it('fits 320 px', () => {
    expect(start).toBeGreaterThan(0);
    // Жодної фіксованої ширини понад 320 px.
    for (const [, value, unit] of section.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    // Стовпці тягнуться за шириною й не розпирають сітку.
    expect(section).toMatch(/\.sudoku-grid \{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
    expect(section).toMatch(/\.crossword-grid \{[^}]*grid-template-columns:\s*repeat\(var\(--cols\),\s*minmax\(0,\s*1fr\)\)/);
    expect(section).toMatch(/\.crossword-input \{[^}]*font-size:\s*1rem/);
  });

  it('a 12-column crossword keeps 24 px cells at 320 px: the board takes the side padding', () => {
    // 320 px − по 4 px від краю = 312 px; 12 стовпців з проміжком 1 px — (312 − 11) / 12 ≈ 25 px (у полях сторінки було б ≈ 22 px).
    const narrow = section.match(/@media \(max-width: 480px\)[^{]*\{\s*\.crossword-board \{([^}]*)\}/);
    expect(narrow).not.toBeNull();
    expect(narrow![1]).toMatch(/width:\s*calc\(100% \+ 2 \* var\(--app-pad\) - 0\.5rem\)/);
    expect(narrow![1]).toMatch(/margin-inline:\s*calc\(0\.25rem - var\(--app-pad\)\)/);
    const cell = (320 - 8 - 11) / 12;
    expect(cell).toBeGreaterThanOrEqual(24);
  });

  it('the timer total stays on one line (/120 s on a 360 px phone)', () => {
    expect(css).toMatch(/\.timer-total,\n\.timer-label::after \{[^}]*white-space:\s*nowrap/);
  });

  it('own sudoku digits are not in the accent red', () => {
    expect(section).toMatch(/\.sudoku-cell \{[^}]*color:\s*var\(--by, var\(--puzzle-ink\)\)/);
    expect(section).not.toMatch(/\.sudoku-cell \{[^}]*color:\s*var\(--by, var\(--amber\)\)/);
  });
});
