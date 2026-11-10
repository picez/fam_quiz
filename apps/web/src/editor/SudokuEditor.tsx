import { SUDOKU_CELLS, SUDOKU_LEVELS, SUDOKU_SIZE, generateSudoku, type Question, type SudokuLevel } from '@quiz/shared';
import { useRef, type KeyboardEvent } from 'react';
import { t, type TextKey } from '../i18n';
import { randomSudokuSeed, sudokuCheck, withSudokuGivens } from './draft';

type Sudoku = Extract<Question, { type: 'sudoku' }>;

const CELLS = Array.from({ length: SUDOKU_CELLS }, (_, i) => i);
/** Крок фокуса за стрілкою (сітка завжди зліва направо, як цифри). */
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SUDOKU_SIZE, ArrowDown: SUDOKU_SIZE };

/** Межі блоків 2×3: товста лінія після третього стовпця й після кожного другого рядка. */
const cellClass = (i: number) => {
  const row = Math.floor(i / SUDOKU_SIZE);
  const col = i % SUDOKU_SIZE;
  return `sudoku-editor-cell${col === 2 ? ' is-box-end' : ''}${row % 2 === 1 && row < SUDOKU_SIZE - 1 ? ' is-box-bottom' : ''}`;
};

/**
 * «Судоку» в редакторі: сітку генерує гра за складністю (той самий seed — та сама сітка) або цифри задає ведучий.
 * Для своїх цифр під сіткою — живий стан: розв'язок єдиний (тоді він записується), кілька, жодного чи повтор із підсвіченими клітинками.
 */
export function SudokuEditor({ question, onChange }: { question: Sudoku; onChange: (q: Question) => void }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const custom = question.level === 'custom';
  const check = sudokuCheck(question.givens);
  const given = (i: number) => (question.givens[i] ?? '0') !== '0';
  const count = CELLS.filter(given).length;
  const generate = (level: SudokuLevel, seed: number) => onChange({ ...question, level, seed, ...generateSudoku(seed, level) });
  const setDigit = (i: number, digit: string) => onChange(withSudokuGivens(question, question.givens.slice(0, i) + digit + question.givens.slice(i + 1)));
  // Свої цифри не зникають мовчки: нова сітка замість них — лише після підтвердження.
  const toGenerator = () => {
    if (custom && count > 0 && !window.confirm(t('sudokuGenerateConfirm'))) return;
    generate('medium', randomSudokuSeed());
  };
  const status: TextKey | null = check.conflicts.length > 0 ? 'sudokuConflict' : check.count === 1 ? 'sudokuUnique' : check.count > 1 ? 'sudokuMany' : count > 0 ? 'sudokuNone' : null;

  const onKey = (i: number, event: KeyboardEvent<HTMLInputElement>) => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    const next = i + step;
    // Ліворуч і праворуч — лише в межах рядка.
    const sameRow = Math.abs(step) !== 1 || Math.floor(next / SUDOKU_SIZE) === Math.floor(i / SUDOKU_SIZE);
    if (next < 0 || next >= SUDOKU_CELLS || !sameRow) return;
    event.preventDefault();
    inputs.current[next]?.focus();
  };

  return (
    <div className="sudoku-editor">
      <div className="sudoku-editor-choice" role="radiogroup" aria-label={t('sudokuSourceLabel')}>
        <label className="check">
          <input type="radio" name={`sudoku-source-${question.id}`} checked={!custom} onChange={toGenerator} />
          <span>{t('sudokuSourceGenerate')}</span>
        </label>
        <label className="check">
          {/* Свої цифри починаються з поточних: розв'язок той самий. */}
          <input type="radio" name={`sudoku-source-${question.id}`} checked={custom} onChange={() => onChange(withSudokuGivens(question, question.givens))} />
          <span>{t('sudokuSourceCustom')}</span>
        </label>
      </div>
      {!custom && (
        <div className="sudoku-editor-choice">
          <div role="radiogroup" aria-label={t('sudokuLevelLabel')}>
            {SUDOKU_LEVELS.map((level) => (
              <label className="check" key={level}>
                <input type="radio" name={`sudoku-level-${question.id}`} checked={question.level === level} onChange={() => generate(level, question.seed ?? randomSudokuSeed())} />
                <span>{t(`sudokuLevel_${level}`)}</span>
              </label>
            ))}
          </div>
          <button type="button" className="btn btn-small" onClick={() => generate(question.level === 'custom' ? 'medium' : question.level, randomSudokuSeed())}>
            {t('sudokuNewGrid')}
          </button>
        </div>
      )}
      <div className="sudoku-editor-grid" role="group" aria-label={t('sudokuGridLabel')} dir="ltr">
        {CELLS.map((i) =>
          custom ? (
            <input
              key={i}
              ref={(element) => {
                inputs.current[i] = element;
              }}
              className={`${cellClass(i)}${check.conflicts.includes(i) ? ' is-conflict' : ''}`}
              aria-label={t('sudokuCellLabel', { row: Math.floor(i / SUDOKU_SIZE) + 1, col: (i % SUDOKU_SIZE) + 1 })}
              inputMode="numeric"
              autoComplete="off"
              value={given(i) ? question.givens[i] : ''}
              onKeyDown={(event) => onKey(i, event)}
              onChange={(event) => {
                // Остання набрана цифра 1–6 замінює попередню; порожнє — стерти; решта не вписується.
                const typed = event.target.value.slice(-1);
                if (event.target.value === '') setDigit(i, '0');
                else if (/^[1-6]$/.test(typed)) setDigit(i, typed);
              }}
            />
          ) : (
            <span key={i} className={`${cellClass(i)}${given(i) ? ' is-given' : ''}`}>
              {given(i) ? question.givens[i] : ''}
            </span>
          ),
        )}
      </div>
      <p className="meta">{t('sudokuGivenCount', { count, total: SUDOKU_CELLS })}</p>
      {custom && <p className="meta">{t('sudokuCustomHint')}</p>}
      {/* Місце для стану є завжди: читач екрана чує зміну. */}
      <p className={status === 'sudokuUnique' ? 'meta sudoku-editor-status is-ok' : 'meta sudoku-editor-status powers-warn'} role="status">
        {status === null ? '' : t(status)}
      </p>
      <p className="meta">{t('sudokuHelp')}</p>
    </div>
  );
}
