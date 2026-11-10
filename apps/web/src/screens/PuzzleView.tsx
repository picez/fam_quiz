import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { crosswordLetter, type PlayerPuzzle, type PublicPuzzle, type PublicQuestion } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { usePuzzleBoard, type PuzzleBoardModel } from '../live/usePuzzleBoard';

/** Після «Готово» кнопка підтвердження на мить глуха: другий дотик подвійного натиску не фіксує сітку. */
export const PUZZLE_TAP_GAP_MS = 350;

/** У прихованому полі кросворду завжди стоїть цей символ: Backspace на Android (без keydown) стирає його — так його й видно. */
const SENTINEL = '​';

const SUDOKU_SIDE = 6;
const DIGITS = ['1', '2', '3', '4', '5', '6'];

type Crossword = Extract<PublicPuzzle, { kind: 'crossword' }>;
type Dir = 'across' | 'down';

export interface PuzzlePlayProps {
  info: PlayerPuzzle;
  question: PublicQuestion;
  questionIndex: number;
  paused: boolean;
  timeUp: boolean;
  /** Запитання закрив сервер (locked): сітка лише для перегляду, рядок стану — у батька. */
  closed?: boolean;
  send: Send;
  /** Командна гра: нікнейми учасників у порядку команди — кольори «хто вписав» (маска '1'…'9'). */
  members?: string[];
}

/** Поле, де клавіші належать самому полю. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

/** Клас кольору учасника, що вписав клітинку (лише в команді). */
function byClass(mask: string, i: number, members: string[] | undefined): string {
  const ch = mask[i] ?? '0';
  return members !== undefined && members.length > 1 && ch >= '1' && ch <= '9' ? ` by-${ch}` : '';
}

function cellLabel(row: number, col: number, value: string): string {
  const where = t('sudokuCellLabel', { row: row + 1, col: col + 1 });
  return value === '' ? where : `${where}: ${value}`;
}

/** Хто з команди якого кольору. */
function Legend({ members }: { members: string[] | undefined }) {
  if (members === undefined || members.length < 2) return null;
  return (
    <ul className="puzzle-legend">
      {members.map((name, n) => (
        <li key={n}>
          <span className={`puzzle-swatch by-${Math.min(n + 1, 9)}`} aria-hidden="true" />
          <span dir="auto">{name}</span>
        </li>
      ))}
    </ul>
  );
}

/** «Готово» з підтвердженням: фіксація безповоротна. Кнопка «Так» перші PUZZLE_TAP_GAP_MS глуха й стоїть не на місці «Готово». */
function DoneButton({ off, onDone }: { off: boolean; onDone: () => Promise<SendResult> }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const openedAt = useRef(0);
  const busy = useRef(false);
  const open = () => {
    if (off) return;
    setError('');
    openedAt.current = Date.now();
    setAsking(true);
  };
  const confirm = async () => {
    if (off || busy.current || Date.now() - openedAt.current < PUZZLE_TAP_GAP_MS) return;
    busy.current = true;
    const result = await onDone();
    busy.current = false;
    if (result.ok || result.error === 'puzzle_done') return;
    setAsking(false);
    setError(errorText(result.error));
  };
  return (
    <div className="puzzle-done-box">
      {asking && !off ? (
        <div className="puzzle-confirm" role="alertdialog" aria-labelledby="puzzle-confirm-text">
          <p id="puzzle-confirm-text">{t('puzzleConfirm')}</p>
          <div className="puzzle-confirm-actions">
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              {t('puzzleConfirmNo')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void confirm()}>
              {t('puzzleConfirmYes')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary puzzle-done" aria-disabled={off} onClick={open}>
          {t('puzzleDone')}
        </button>
      )}
      {error !== '' && (
        <p className="puzzle-status" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

/** Рядок стану під сіткою: зв'язок, відмова, кінець часу, «Чекаємо інших». */
function StatusLine({ board, info, timeUp, closed }: { board: PuzzleBoardModel; info: PlayerPuzzle; timeUp: boolean; closed: boolean }) {
  const text = closed
    ? ''
    : info.done
      ? t('puzzleWaiting')
      : timeUp
        ? t('puzzleTimeUp')
        : board.status === 'offline'
          ? t('puzzleOffline')
          : (board.error ?? '');
  return (
    <p className="puzzle-status" role="status" aria-live="polite">
      {text}
    </p>
  );
}

function filledCount(info: PlayerPuzzle, cells: string[]): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const m = info.mask[i];
    if (m === 'g' || m === '#') continue;
    total += 1;
    if (cells[i] !== '') filled += 1;
  }
  return { filled, total };
}

/**
 * Судоку на телефоні: сітка 6×6 на всю ширину з товстими межами блоків 2×3, задані цифри напівжирні й не вибираються.
 * Тап вибирає клітинку й підсвічує її рядок, стовпець і блок; цифри — власна клавіатура 1–6 і «Стерти» (системна не відкривається),
 * фізична клавіатура теж (1–6, Backspace/Delete, стрілки). Пауза, кінець часу чи «Готово» — сітка й клавіатура вимкнені.
 */
export function SudokuPlay({ info, question, questionIndex, paused, timeUp, closed = false, send, members }: PuzzlePlayProps) {
  const board = usePuzzleBoard(info, questionIndex, send);
  const [sel, setSel] = useState<number | null>(null);
  const givens = question.puzzle?.kind === 'sudoku' ? question.puzzle.givens : '0'.repeat(SUDOKU_SIDE * SUDOKU_SIDE);
  const off = paused || timeUp || closed || !info.canEdit || info.done;
  const given = (i: number) => (givens[i] ?? '0') !== '0';
  const selected = off ? null : sel;

  const put = (v: string) => {
    if (off || sel === null || given(sel)) return;
    board.set(sel, v);
  };
  const move = (dr: number, dc: number) => {
    if (off) return;
    const from = sel ?? -1;
    let row = from < 0 ? 0 : Math.floor(from / SUDOKU_SIDE);
    let col = from < 0 ? -1 : from % SUDOKU_SIDE;
    if (from < 0 && dr !== 0) {
      col = 0;
      row = -dr;
    }
    for (let step = 0; step < SUDOKU_SIDE; step += 1) {
      row += dr;
      col += dc;
      if (row < 0 || row >= SUDOKU_SIDE || col < 0 || col >= SUDOKU_SIDE) return;
      const i = row * SUDOKU_SIDE + col;
      if (!given(i)) {
        setSel(i);
        return;
      }
    }
  };

  const keyNow = useRef<(event: KeyboardEvent) => void>(() => {});
  keyNow.current = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
    if (DIGITS.includes(event.key)) put(event.key);
    else if (event.key === 'Backspace' || event.key === 'Delete') put('');
    else if (event.key === 'ArrowUp') move(-1, 0);
    else if (event.key === 'ArrowDown') move(1, 0);
    else if (event.key === 'ArrowLeft') move(0, -1);
    else if (event.key === 'ArrowRight') move(0, 1);
    else return;
    event.preventDefault();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyNow.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (question.puzzle?.kind !== 'sudoku') return null;
  const peer = (i: number) => {
    if (selected === null) return false;
    const [r, c] = [Math.floor(i / SUDOKU_SIDE), i % SUDOKU_SIDE];
    const [sr, sc] = [Math.floor(selected / SUDOKU_SIDE), selected % SUDOKU_SIDE];
    return r === sr || c === sc || (Math.floor(r / 2) === Math.floor(sr / 2) && Math.floor(c / 3) === Math.floor(sc / 3));
  };
  const { filled, total } = filledCount(info, board.cells);

  return (
    <section className={off ? 'puzzle-play sudoku-play is-off' : 'puzzle-play sudoku-play'}>
      <p className="meta puzzle-count">
        <bdi dir="ltr">{t('puzzleFilled', { filled, total })}</bdi>
      </p>
      <div className="sudoku-grid" role="group" aria-label={t('sudokuGridLabel')} aria-disabled={off} dir="ltr">
        {Array.from({ length: SUDOKU_SIDE * SUDOKU_SIDE }, (_, i) => {
          const row = Math.floor(i / SUDOKU_SIDE);
          const col = i % SUDOKU_SIDE;
          const edges = `${col === 2 ? ' is-box-end' : ''}${row === 1 || row === 3 ? ' is-box-bottom' : ''}`;
          if (given(i)) {
            return (
              <span key={i} className={`sudoku-cell is-given${edges}${peer(i) ? ' is-peer' : ''}`} aria-label={cellLabel(row, col, givens[i])}>
                {givens[i]}
              </span>
            );
          }
          const value = board.cells[i] ?? '';
          const state = selected === i ? ' is-selected' : peer(i) ? ' is-peer' : '';
          return (
            <button
              key={i}
              type="button"
              className={`sudoku-cell${edges}${state}${byClass(info.mask, i, members)}`}
              aria-label={cellLabel(row, col, value)}
              aria-pressed={selected === i}
              aria-disabled={off}
              onClick={() => {
                if (!off) setSel(i);
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
      <Legend members={members} />
      {!info.done && !closed && (
        <div className="puzzle-keypad" role="group" aria-label={t('puzzleKeypad')}>
          {DIGITS.map((digit) => (
            <button key={digit} type="button" className="btn puzzle-key" aria-disabled={off || selected === null} onClick={() => put(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className="btn puzzle-key puzzle-erase" aria-disabled={off || selected === null} onClick={() => put('')}>
            {t('puzzleErase')}
          </button>
        </div>
      )}
      <StatusLine board={board} info={info} timeUp={timeUp} closed={closed} />
      {!info.done && !closed && <DoneButton off={off} onDone={board.done} />}
    </section>
  );
}

interface Word {
  number: number;
  dir: Dir;
  clue: string;
  cells: number[];
}

function wordsOf(puzzle: Crossword): Word[] {
  return puzzle.words.map((w) => ({
    number: w.number,
    dir: w.dir,
    clue: w.clue,
    cells: Array.from({ length: w.length }, (_, j) => (w.dir === 'across' ? w.row * puzzle.width + w.col + j : (w.row + j) * puzzle.width + w.col)),
  }));
}

const ARROW: Record<Dir, string> = { across: '→', down: '↓' };

/**
 * Кросворд на телефоні: угорі активна підказка («3 ↓ …»), нижче сітка (до 12 стовпців на 320 px без прокрутки вбік), під нею
 * смужка ключа (режим key), «Стерти» і згорнутий список підказок. Тап вибирає слово; повторний тап на перетині міняє напрямок;
 * тап по підказці — слово й перша порожня клітинка. Літери — системна клавіатура через приховане поле: кожен символ проходить
 * crosswordLetter (апостроф, латиниця, цифри — повз), курсор іде на наступну клітинку слова, а з кінця — на наступне незаповнене
 * слово. Backspace стирає й відступає.
 */
export function CrosswordPlay({ info, question, questionIndex, paused, timeUp, closed = false, send, members }: PuzzlePlayProps) {
  const board = usePuzzleBoard(info, questionIndex, send);
  const [sel, setSel] = useState<{ cell: number; dir: Dir } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const puzzle = question.puzzle?.kind === 'crossword' ? question.puzzle : null;
  const words = puzzle === null ? [] : wordsOf(puzzle);
  const off = paused || timeUp || closed || !info.canEdit || info.done;
  const selected = off ? null : sel;

  // Сітка вимкнулась — фокус з поля геть: системна клавіатура ховається.
  useEffect(() => {
    if (off && document.activeElement === input.current) input.current?.blur();
  }, [off]);

  if (puzzle === null) return null;
  const width = puzzle.width;
  const wordAt = (cell: number, dir: Dir) => words.find((w) => w.dir === dir && w.cells.includes(cell));
  const activeWord = selected === null ? undefined : wordAt(selected.cell, selected.dir);
  const keyIndex = new Map(puzzle.keyCells.map((cell, n) => [cell, n]));
  const numbers = new Map<number, number>();
  for (const w of words) if (!numbers.has(w.cells[0])) numbers.set(w.cells[0], w.number);

  const focus = () => {
    const el = input.current;
    if (el === null) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  };

  const firstEmpty = (w: Word, values: readonly string[]) => w.cells.find((c) => values[c] === '') ?? w.cells[0];

  const pick = (cell: number, dir?: Dir) => {
    if (off) return;
    if (dir !== undefined) setSel({ cell, dir });
    else if (sel !== null && sel.cell === cell) {
      const other: Dir = sel.dir === 'across' ? 'down' : 'across';
      if (wordAt(cell, other) !== undefined) setSel({ cell, dir: other });
    } else {
      const keep = sel !== null && wordAt(cell, sel.dir) !== undefined ? sel.dir : wordAt(cell, 'across') !== undefined ? 'across' : 'down';
      setSel({ cell, dir: keep });
    }
    focus();
  };

  /** Наступна клітинка після вписаної: далі в слові, а з кінця — перша порожня наступного незаповненого слова. */
  const next = (at: { cell: number; dir: Dir }, values: readonly string[]): { cell: number; dir: Dir } => {
    const word = wordAt(at.cell, at.dir);
    if (word === undefined) return at;
    const j = word.cells.indexOf(at.cell);
    if (j < word.cells.length - 1) return { cell: word.cells[j + 1], dir: at.dir };
    const k = words.indexOf(word);
    for (let step = 1; step <= words.length; step += 1) {
      const w = words[(k + step) % words.length];
      const empty = w.cells.find((c) => values[c] === '');
      if (empty !== undefined) return { cell: empty, dir: w.dir };
    }
    return at;
  };

  const write = (text: string) => {
    if (off || sel === null) return;
    const values = [...board.cells];
    let at = sel;
    for (const ch of [...text.normalize('NFC')]) {
      const letter = crosswordLetter(ch);
      if (letter === null) continue;
      board.set(at.cell, letter);
      values[at.cell] = letter;
      at = next(at, values);
    }
    setSel(at);
  };

  const erase = () => {
    if (off || sel === null) return;
    if (board.cells[sel.cell] !== '') {
      board.set(sel.cell, '');
      return;
    }
    const word = wordAt(sel.cell, sel.dir);
    const j = word?.cells.indexOf(sel.cell) ?? -1;
    if (word === undefined || j <= 0) return;
    const back = word.cells[j - 1];
    board.set(back, '');
    setSel({ cell: back, dir: sel.dir });
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value.includes(SENTINEL)) erase();
    else write(value.split(SENTINEL).join(''));
  };

  const step = (dr: number, dc: number, dir: Dir) => {
    if (sel === null) return;
    let row = Math.floor(sel.cell / width);
    let col = sel.cell % width;
    for (;;) {
      row += dr;
      col += dc;
      if (row < 0 || row >= puzzle.height || col < 0 || col >= width) return;
      const i = row * width + col;
      if (puzzle.mask[i] === '1') {
        setSel({ cell: i, dir: wordAt(i, dir) !== undefined ? dir : dir === 'across' ? 'down' : 'across' });
        return;
      }
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowLeft') step(0, -1, 'across');
    else if (event.key === 'ArrowRight') step(0, 1, 'across');
    else if (event.key === 'ArrowUp') step(-1, 0, 'down');
    else if (event.key === 'ArrowDown') step(1, 0, 'down');
    else if (event.key === 'Delete') {
      if (sel !== null) board.set(sel.cell, '');
    } else return;
    event.preventDefault();
  };

  const style = { '--cols': width } as CSSProperties;
  const lists: { dir: Dir; title: string }[] = [
    { dir: 'across', title: t('crosswordAcross') },
    { dir: 'down', title: t('crosswordDown') },
  ];
  const { filled, total } = filledCount(info, board.cells);

  return (
    <section className={off ? 'puzzle-play crossword-play is-off' : 'puzzle-play crossword-play'}>
      <p className="crossword-active" dir="auto">
        {activeWord === undefined ? (
          t('crosswordPick')
        ) : (
          <>
            <bdi dir="ltr">{`${activeWord.number} ${ARROW[activeWord.dir]}`}</bdi> {activeWord.clue}
          </>
        )}
      </p>
      <p className="meta puzzle-count">
        <bdi dir="ltr">{t('puzzleFilled', { filled, total })}</bdi>
      </p>
      <div className="crossword-board">
        <div className="crossword-grid" style={style} role="group" aria-label={t('crosswordGridLabel')} aria-disabled={off} dir="ltr">
          {Array.from({ length: width * puzzle.height }, (_, i) => {
            if (puzzle.mask[i] !== '1') return <span key={i} className="crossword-play-cell is-block" aria-hidden="true" />;
            const value = board.cells[i] ?? '';
            const key = keyIndex.get(i);
            const number = numbers.get(i);
            const state = `${activeWord?.cells.includes(i) === true ? ' is-word' : ''}${selected?.cell === i ? ' is-selected' : ''}${key !== undefined ? ' is-key' : ''}`;
            return (
              <button
                key={i}
                type="button"
                className={`crossword-play-cell${state}${byClass(info.mask, i, members)}`}
                aria-label={cellLabel(Math.floor(i / width), i % width, value)}
                aria-pressed={selected?.cell === i}
                aria-disabled={off}
                onClick={() => pick(i)}
              >
                {number !== undefined && <span className="crossword-number">{number}</span>}
                {key !== undefined && <span className="crossword-key-n">{key + 1}</span>}
                <span className="crossword-letter">{value}</span>
              </button>
            );
          })}
        </div>
        {/* Поле для системної клавіатури: у DOM завжди (фокус не стрибає), 16 px — iOS не збільшує сторінку. */}
        <input
          ref={input}
          className="crossword-input"
          aria-label={t('crosswordInput')}
          value={SENTINEL}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={off}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
        />
      </div>
      {puzzle.mode === 'key' && puzzle.keyCells.length > 0 && (
        <div className="crossword-key" role="group" aria-label={t('crosswordModeKey')} dir="ltr">
          {puzzle.keyCells.map((cell, n) => (
            <button
              key={n}
              type="button"
              className={selected?.cell === cell ? 'crossword-key-cell is-selected' : 'crossword-key-cell'}
              aria-label={`${n + 1}`}
              aria-disabled={off}
              onClick={() => pick(cell, wordAt(cell, 'across') !== undefined && selected?.dir !== 'down' ? 'across' : wordAt(cell, 'down') !== undefined ? 'down' : 'across')}
            >
              {board.cells[cell] ?? ''}
            </button>
          ))}
        </div>
      )}
      <Legend members={members} />
      {!info.done && !closed && (
        <div className="puzzle-tools">
          <button type="button" className="btn puzzle-erase" aria-disabled={off || selected === null} onClick={() => {
              if (off) return;
              erase();
              focus();
            }}
          >
            {t('puzzleErase')}
          </button>
        </div>
      )}
      <details className="crossword-clues">
        <summary>{t('crosswordClues')}</summary>
        {lists.map(({ dir, title }) => (
          <div key={dir}>
            <h3 className="meta">{title}</h3>
            <ol>
              {words
                .filter((w) => w.dir === dir)
                .map((w) => (
                  <li key={`${w.dir}${w.number}`}>
                    <button type="button" className="crossword-clue" aria-disabled={off} onClick={() => pick(firstEmpty(w, board.cells), w.dir)} dir="auto">
                      <bdi dir="ltr">{w.number}.</bdi> {w.clue}
                    </button>
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </details>
      <StatusLine board={board} info={info} timeUp={timeUp} closed={closed} />
      {!info.done && !closed && <DoneButton off={off} onDone={board.done} />}
    </section>
  );
}

/** Головоломка за видом: судоку чи кросворд. */
export function PuzzlePlay(props: PuzzlePlayProps) {
  return props.question.puzzle?.kind === 'crossword' ? <CrosswordPlay {...props} /> : <SudokuPlay {...props} />;
}

/** Сітка лише для читання: власна з позначеними помилками чи правильний розв'язок. */
function StaticGrid({ puzzle, values, wrong }: { puzzle: PublicPuzzle; values: readonly string[]; wrong?: ReadonlySet<number> }) {
  if (puzzle.kind === 'sudoku') {
    return (
      <div className="sudoku-grid puzzle-reveal-grid" dir="ltr">
        {Array.from({ length: SUDOKU_SIDE * SUDOKU_SIDE }, (_, i) => {
          const row = Math.floor(i / SUDOKU_SIDE);
          const col = i % SUDOKU_SIDE;
          const g = puzzle.givens[i] ?? '0';
          const edges = `${col === 2 ? ' is-box-end' : ''}${row === 1 || row === 3 ? ' is-box-bottom' : ''}`;
          return (
            <span key={i} className={`sudoku-cell${g !== '0' ? ' is-given' : ''}${edges}${wrong?.has(i) === true ? ' is-wrong' : ''}`}>
              {g !== '0' ? g : (values[i] ?? '')}
            </span>
          );
        })}
      </div>
    );
  }
  const keys = new Set(puzzle.keyCells);
  return (
    <div className="crossword-grid puzzle-reveal-grid" style={{ '--cols': puzzle.width } as CSSProperties} dir="ltr">
      {Array.from({ length: puzzle.width * puzzle.height }, (_, i) =>
        puzzle.mask[i] !== '1' ? (
          <span key={i} className="crossword-play-cell is-block" aria-hidden="true" />
        ) : (
          <span key={i} className={`crossword-play-cell${keys.has(i) ? ' is-key' : ''}${wrong?.has(i) === true ? ' is-wrong' : ''}`}>
            <span className="crossword-letter">{values[i] ?? ''}</span>
          </span>
        ),
      )}
    </div>
  );
}

/** Розкриття на телефоні: своя сітка з позначеними хибними клітинками й правильний розв'язок. */
export function PuzzleReveal({ mine, question, solution }: { mine: PlayerPuzzle | undefined; question: PublicQuestion; solution: string[] | null }) {
  const puzzle = question.puzzle;
  if (puzzle === undefined) return null;
  const wrong = new Set(mine?.result?.wrong ?? []);
  return (
    <section className="puzzle-reveal">
      {mine !== undefined && (
        <figure className="puzzle-reveal-part">
          <figcaption className="meta">{t('puzzleYours')}</figcaption>
          <StaticGrid puzzle={puzzle} values={mine.cells} wrong={wrong} />
        </figure>
      )}
      {solution !== null && (
        <figure className="puzzle-reveal-part">
          <figcaption className="meta">{t('puzzleSolution')}</figcaption>
          <StaticGrid puzzle={puzzle} values={solution} />
        </figure>
      )}
    </section>
  );
}
