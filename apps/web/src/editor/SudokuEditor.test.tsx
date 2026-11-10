// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_SUDOKU, countSudoku, generateSudoku, type Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion } from './draft';
import { SudokuEditor } from './SudokuEditor';

type Sudoku = Extract<Question, { type: 'sudoku' }>;

afterEach(cleanup);

/** Редактор зі станом, як у QuizEditor: кожна зміна повертається в проп. */
function Harness({ initial, spy }: { initial: Sudoku; spy: (q: Sudoku) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <SudokuEditor
      question={question}
      onChange={(next) => {
        spy(next as Sudoku);
        setQuestion(next as Sudoku);
      }}
    />
  );
}

const view = (initial: Sudoku) => {
  const spy = vi.fn<(q: Sudoku) => void>();
  render(<Harness initial={initial} spy={spy} />);
  return { spy, last: () => spy.mock.calls.at(-1)![0] };
};
const cell = (row: number, col: number) => screen.getByLabelText(t('sudokuCellLabel', { row, col })) as HTMLInputElement;
const givensOf = (grid: string) => [...grid].filter((ch) => ch !== '0').length;

describe('SudokuEditor', () => {
  it('generates by level', () => {
    const start = newQuestion('sudoku') as Sudoku;
    const { last } = view(start);
    expect(screen.getByText(t('sudokuGivenCount', { count: 16, total: 36 }))).toBeTruthy();

    // Інша складність — нова сітка з тим самим seed.
    fireEvent.click(screen.getByRole('radio', { name: t('sudokuLevel_easy') }));
    const easy = last();
    expect(easy).toMatchObject({ level: 'easy', seed: start.seed });
    expect(easy).toMatchObject(generateSudoku(easy.seed!, 'easy'));
    expect(givensOf(easy.givens)).toBe(20);

    fireEvent.click(screen.getByRole('button', { name: t('sudokuNewGrid') }));
    const fresh = last();
    expect(fresh.level).toBe('easy');
    expect(fresh.seed).not.toBe(easy.seed);
    expect(fresh).toMatchObject(generateSudoku(fresh.seed!, 'easy'));
    expect(givensOf(fresh.givens)).toBe(20);
    expect(screen.getByText(t('sudokuGivenCount', { count: 20, total: 36 }))).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: t('sudokuLevel_hard') }));
    expect(last()).toMatchObject({ level: 'hard', seed: fresh.seed, ...generateSudoku(fresh.seed!, 'hard') });
    // Прев'ю без полів: цифри генератора не редагуються.
    expect(screen.queryByLabelText(t('sudokuCellLabel', { row: 1, col: 1 }))).toBeNull();
  });

  it('checks host digits live', () => {
    const { last } = view({ ...(newQuestion('sudoku') as Sudoku), level: 'custom', seed: null, givens: EMPTY_SUDOKU, solution: EMPTY_SUDOKU });
    // Чотири цифри — розв'язків багато.
    fireEvent.change(cell(1, 1), { target: { value: '1' } });
    fireEvent.change(cell(1, 2), { target: { value: '2' } });
    fireEvent.change(cell(2, 1), { target: { value: '3' } });
    fireEvent.change(cell(3, 3), { target: { value: '4' } });
    expect(last().givens.slice(0, 2)).toBe('12');
    expect(screen.getByRole('status').textContent).toBe(t('sudokuMany'));
    // Не цифра 1–6 не вписується.
    fireEvent.change(cell(4, 4), { target: { value: '7' } });
    fireEvent.change(cell(4, 4), { target: { value: 'a' } });
    expect(last().givens[21]).toBe('0');

    // Повтор у рядку: обидві клітинки підсвічено.
    fireEvent.change(cell(1, 6), { target: { value: '1' } });
    expect(screen.getByRole('status').textContent).toBe(t('sudokuConflict'));
    expect(cell(1, 1).className).toContain('is-conflict');
    expect(cell(1, 6).className).toContain('is-conflict');
    expect(cell(1, 2).className).not.toContain('is-conflict');
    expect(last().solution).toBe(EMPTY_SUDOKU);
    fireEvent.change(cell(1, 6), { target: { value: '' } });
    expect(cell(1, 1).className).not.toContain('is-conflict');
    cleanup();

    // Згенерована сітка без однієї заданої цифри має кілька розв'язків; цифра на місці — знову єдиний.
    const { givens, solution } = generateSudoku(7, 'hard');
    const without = (i: number) => givens.slice(0, i) + '0' + givens.slice(i + 1);
    const at = [...givens].findIndex((ch, i) => ch !== '0' && countSudoku(without(i)).count > 1);
    expect(at).toBeGreaterThanOrEqual(0);
    const second = view({ ...(newQuestion('sudoku') as Sudoku), level: 'custom', seed: null, givens: without(at), solution: EMPTY_SUDOKU });
    expect(screen.getByRole('status').textContent).toBe(t('sudokuMany'));
    fireEvent.change(cell(Math.floor(at / 6) + 1, (at % 6) + 1), { target: { value: givens[at] } });
    expect(second.last()).toMatchObject({ givens, solution });
    expect(screen.getByRole('status').textContent).toBe(t('sudokuUnique'));
  });

  it('copies the generated digits into the own grid and moves with the arrows', () => {
    const start = newQuestion('sudoku') as Sudoku;
    const { last } = view(start);
    fireEvent.click(screen.getByRole('radio', { name: t('sudokuSourceCustom') }));
    expect(last()).toMatchObject({ level: 'custom', seed: null, givens: start.givens, solution: start.solution });
    expect(screen.getByRole('status').textContent).toBe(t('sudokuUnique'));
    cell(1, 1).focus();
    fireEvent.keyDown(cell(1, 1), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1, 2));
    fireEvent.keyDown(cell(1, 2), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(2, 2));
    // Назад до генератора — нова сітка середньої складності.
    fireEvent.click(screen.getByRole('radio', { name: t('sudokuSourceGenerate') }));
    expect(last().level).toBe('medium');
    expect(last()).toMatchObject(generateSudoku(last().seed!, 'medium'));
  });
});
