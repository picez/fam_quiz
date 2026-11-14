import { describe, expect, it } from 'vitest';
import {
  EMPTY_SUDOKU,
  SUDOKU_GIVENS,
  SUDOKU_LEVELS,
  countSudoku,
  generateSudoku,
  isSudokuGrid,
  singlesSolvable,
  sudokuConflicts,
  sudokuIssue,
} from './sudoku';
import { seededRng } from './random';

/** Правильна повна сітка 6×6 з блоками 2×3. */
const FULL = '123456' + '456123' + '231564' + '564231' + '312645' + '645312';

const put = (grid: string, cells: Record<number, string>) =>
  [...grid].map((ch, i) => cells[i] ?? ch).join('');
const keep = (solution: string, cells: number[]) =>
  [...solution].map((ch, i) => (cells.includes(i) ? ch : '0')).join('');
const givensOf = (grid: string) => [...grid].filter((ch) => ch !== '0').length;
const subsetOf = (givens: string, solution: string) =>
  [...givens].every((ch, i) => ch === '0' || ch === solution[i]);

describe('sudoku', () => {
  it('counts solutions up to the limit', () => {
    expect(countSudoku(FULL)).toEqual({ count: 1, solution: FULL });
    expect(countSudoku(EMPTY_SUDOKU).count).toBe(2);
    expect(countSudoku(EMPTY_SUDOKU, 5).count).toBe(5);
    expect(countSudoku(put(FULL, { 1: '1' }))).toEqual({ count: 0, solution: null });
    expect(countSudoku(put(FULL, { 7: '0' }))).toEqual({ count: 1, solution: FULL });
  });

  it('finds conflicts in rows, columns and boxes', () => {
    const grid = put(EMPTY_SUDOKU, { 0: '5', 5: '5', 16: '3', 34: '3', 12: '1', 20: '1' });
    expect(sudokuConflicts(grid)).toEqual([0, 5, 12, 16, 20, 34]);
    expect(sudokuConflicts(FULL)).toEqual([]);
    expect(sudokuConflicts(EMPTY_SUDOKU)).toEqual([]);
  });

  it('checks the grid format', () => {
    expect(isSudokuGrid(FULL)).toBe(true);
    expect(isSudokuGrid(EMPTY_SUDOKU)).toBe(true);
    expect(isSudokuGrid(put(FULL, { 3: '7' }))).toBe(false);
    expect(isSudokuGrid(FULL.slice(1))).toBe(false);
  });

  it('seeds a repeatable random sequence', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRng(43)()).not.toBe(xs[0]);
  });

  it('generates the same grid for the same seed', () => {
    expect(generateSudoku(7, 'medium')).toEqual(generateSudoku(7, 'medium'));
    expect(generateSudoku(8, 'medium')).not.toEqual(generateSudoku(7, 'medium'));
  });

  it('every generated grid has one solution', () => {
    for (const level of SUDOKU_LEVELS) {
      for (let seed = 0; seed < 50; seed++) {
        const { givens, solution } = generateSudoku(seed, level);
        expect(isSudokuGrid(givens)).toBe(true);
        expect(solution).toMatch(/^[1-6]{36}$/);
        expect(sudokuConflicts(solution)).toEqual([]);
        expect(subsetOf(givens, solution)).toBe(true);
        expect(countSudoku(givens)).toEqual({ count: 1, solution });
      }
    }
  });

  it('levels differ in givens', () => {
    let hardTotal = 0;
    for (let seed = 0; seed < 50; seed++) {
      const easy = generateSudoku(seed, 'easy').givens;
      expect(givensOf(easy)).toBe(SUDOKU_GIVENS.easy);
      expect(singlesSolvable(easy)).toBe(true);
      expect(givensOf(generateSudoku(seed, 'medium').givens)).toBeLessThanOrEqual(17);
      const hard = givensOf(generateSudoku(seed, 'hard').givens);
      expect(hard).toBeLessThanOrEqual(13);
      hardTotal += hard;
    }
    expect(hardTotal / 50).toBeLessThanOrEqual(12.5);
  });

  it('tells grids solvable by singles', () => {
    expect(singlesSolvable(FULL)).toBe(true);
    expect(singlesSolvable(put(FULL, { 0: '0', 8: '0', 30: '0' }))).toBe(true);
    expect(singlesSolvable(EMPTY_SUDOKU)).toBe(false);
    expect(singlesSolvable(put(FULL, { 1: '1' }))).toBe(false);
  });

  it('checks host digits', () => {
    expect(sudokuIssue(put(FULL, { 0: '7' }), FULL)).toBe('sudoku_grid');
    expect(sudokuIssue(FULL.slice(1), FULL)).toBe('sudoku_grid');
    expect(sudokuIssue(keep(FULL, [0, 1]), put(FULL, { 4: '0' }))).toBe('sudoku_grid');
    expect(sudokuIssue(put(EMPTY_SUDOKU, { 0: '5', 5: '5' }), FULL)).toBe('sudoku_conflict');
    expect(sudokuIssue(keep(FULL, [0, 7, 14, 21]), FULL)).toBe('sudoku_many');
    // Рядок 0: 1…5, а 6 у тому самому стовпці 5 нижче — шостій клітинці рядка нема цифри.
    expect(sudokuIssue(put(EMPTY_SUDOKU, { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 11: '6' }), FULL)).toBe('sudoku_none');
    const { givens, solution } = generateSudoku(3, 'hard');
    const other = [...solution].map((ch) => String(7 - Number(ch))).join('');
    expect(sudokuIssue(givens, other)).toBe('sudoku_solution');
    expect(sudokuIssue(givens, solution)).toBeNull();
    expect(sudokuIssue(put(FULL, { 7: '0' }), FULL)).toBeNull();
  });

  it('is fast enough for the editor and the schema', () => {
    const grids = Array.from({ length: 20 }, (_, seed) => generateSudoku(seed, 'hard').givens);
    const start = Date.now();
    for (let i = 0; i < 1000; i++) expect(countSudoku(grids[i % grids.length]).count).toBe(1);
    expect(Date.now() - start).toBeLessThan(1000);
    const one = Date.now();
    generateSudoku(1234, 'hard');
    expect(Date.now() - one).toBeLessThan(50);
  });
});
