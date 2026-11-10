// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { generateSudoku, type PlayerPuzzle, type PublicPuzzle, type PublicQuestion, type PuzzleBoardView, type PuzzleInfo } from '@quiz/shared';
import type { Send, SendResult } from '../live/types';
import { PUZZLE_FLUSH_MS } from '../live/usePuzzleBoard';
import { CrosswordPlay, PUZZLE_PAGE_MS, PUZZLE_TAP_GAP_MS, PuzzleBoards, PuzzleHistoryGrid, PuzzleReveal, SudokuPlay, puzzleGrid } from './PuzzleView';

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
    render(<SudokuPlay info={mineOf(36, { cells, mask })} question={sudoku} questionIndex={0} paused={false} timeUp={false} send={vi.fn<Send>()} members={['Олена', 'Тарас']} />);
    expect(sudokuCell(emptyAt).classList.contains('by-2')).toBe(true);
    expect(screen.getByText('Тарас').closest('li')?.querySelector('.by-2')).not.toBeNull();
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
    const info: PuzzleInfo = { kind: 'sudoku', boards: [boardOf({ playerId: 'team-b', nickname: 'Сині', mask, filled: 2 })], solution: null };
    const teams = [{ id: 'team-b', name: 'Сині', color: 1, captainId: 'u2', answererId: 'u2', members: [{ id: 'u2', nickname: 'Оля', connected: true }, { id: 'u3', nickname: 'Петро', connected: true }] }];
    render(<PuzzleBoards info={info} puzzle={sudoku.puzzle!} reveal={false} teams={teams} />);
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
    expect(document.querySelectorAll('.puzzle-thumb')).toHaveLength(40);
    expect(screen.getByText('Гравець 1')).toBeTruthy();
    act(() => vi.advanceTimersByTime(PUZZLE_PAGE_MS));
    expect(document.querySelectorAll('.puzzle-thumb')).toHaveLength(5);
    expect(screen.getByText('Гравець 45')).toBeTruthy();
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
});
