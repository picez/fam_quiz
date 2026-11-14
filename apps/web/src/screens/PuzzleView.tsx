import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { crosswordCells, crosswordLetter, evenPageSize, pageCount, pageSlice, type PlayerPuzzle, type PublicPuzzle, type PublicQuestion, type PuzzleAnswer, type PuzzleBoardView, type PuzzleInfo, type PuzzleTone, type Question } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { usePuzzleBoard, type PuzzleBoardModel } from '../live/usePuzzleBoard';
import { sudokuPeers, usePencil } from '../live/sudoku-pencil';

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
  /** Кінець часу за годинником телефона (endsAt мінус зсув сервера): правки в останнє вікно пакета йдуть одразу. */
  deadline?: number | null;
  /** Кімната й раунд: за ними олівцеві позначки судоку переживають перезавантаження сторінки (без цього — лише в пам'яті). */
  pencil?: { room: string; round: number };
}

/** Поле, де клавіші належать самому полю. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

/** Клас кольору учасника, що вписав клітинку (лише в команді з кількох): '1'…'9' — tone учасника, 'x' — його вже немає в команді. */
function byClass(mask: string, i: number, members: readonly PuzzleTone[]): string {
  const ch = mask[i] ?? '0';
  if (members.length < 2) return '';
  return (ch >= '1' && ch <= '9') || ch === 'x' ? ` by-${ch}` : '';
}

function cellLabel(row: number, col: number, value: string): string {
  const where = t('sudokuCellLabel', { row: row + 1, col: col + 1 });
  return value === '' ? where : `${where}: ${value}`;
}

/** Хто з команди якого кольору (tone з сервера: місце в команді на відкритті, тож вилучення нікого не перефарбовує). */
function Legend({ members }: { members: readonly PuzzleTone[] }) {
  if (members.length < 2) return null;
  return (
    <ul className="puzzle-legend">
      {members.map((member) => (
        <li key={member.id}>
          <span className={`puzzle-swatch by-${member.tone}`} aria-hidden="true" />
          <span dir="auto">{member.nickname}</span>
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
      : timeUp || board.status === 'time_over'
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
export function SudokuPlay({ info, question, questionIndex, paused, timeUp, closed = false, send, deadline = null, pencil: pencilKey }: PuzzlePlayProps) {
  const board = usePuzzleBoard(info, questionIndex, send, deadline);
  const [sel, setSel] = useState<number | null>(null);
  const [pencilOn, setPencilOn] = useState(false);
  const givens = question.puzzle?.kind === 'sudoku' ? question.puzzle.givens : '0'.repeat(SUDOKU_SIDE * SUDOKU_SIDE);
  const pencil = usePencil(pencilKey?.room, `${pencilKey?.round ?? 0}:${questionIndex}:${givens}`, board.cells);
  const off = paused || timeUp || board.status === 'time_over' || closed || !info.canEdit || info.done;
  const given = (i: number) => (givens[i] ?? '0') !== '0';
  const selected = off ? null : sel;

  const put = (v: string) => {
    if (off || sel === null || given(sel)) return;
    if (pencilOn) {
      // Олівець: цифра в порожній клітинці — позначка, у заповненій — нічого; «Стерти» на порожній чистить позначки, на заповненій — стирає цифру, як без олівця.
      const filled = (board.cells[sel] ?? '') !== '';
      if (v === '' && filled) board.set(sel, '');
      else if (v === '') pencil.clear(sel);
      else if (!filled) pencil.toggle(sel, v);
      return;
    }
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
    return i === selected || sudokuPeers(selected).includes(i);
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
          const notes = value === '' ? (pencil.marks[i] ?? '') : '';
          const label = notes === '' ? cellLabel(row, col, value) : `${cellLabel(row, col, value)}, ${t('sudokuPencilMarks', { digits: [...notes].join(', ') })}`;
          const state = selected === i ? ' is-selected' : peer(i) ? ' is-peer' : '';
          return (
            <button
              key={i}
              type="button"
              className={`sudoku-cell${edges}${state}${byClass(info.mask, i, info.members)}`}
              aria-label={label}
              aria-pressed={selected === i}
              aria-disabled={off}
              onClick={() => {
                if (!off) setSel(i);
              }}
            >
              {notes === '' ? (
                value
              ) : (
                <span className="sudoku-pencil" aria-hidden="true">
                  {DIGITS.map((digit) => (
                    <span key={digit}>{notes.includes(digit) ? digit : ''}</span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Legend members={info.members} />
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
          <button type="button" className="btn puzzle-key puzzle-pencil" aria-pressed={pencilOn} aria-disabled={off} onClick={() => !off && setPencilOn(!pencilOn)}>
            {t('sudokuPencil')}
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

/** Усі клітинки слова заповнені (кожна має літеру) — підказку тоді викреслено в списку. */
export function wordFilled(cells: readonly number[], values: readonly string[]): boolean {
  return cells.every((c) => (values[c] ?? '') !== '');
}

/**
 * Кросворд на телефоні: угорі активна підказка («3 ↓ …»), нижче сітка (до 12 стовпців на 320 px без прокрутки вбік), під нею
 * смужка ключа (режим key), «Стерти» і згорнутий список підказок. Тап вибирає слово; повторний тап на перетині міняє напрямок;
 * тап по підказці — слово й перша порожня клітинка. Літери — системна клавіатура через приховане поле: кожен символ проходить
 * crosswordLetter (апостроф, латиниця, цифри — повз), курсор іде на наступну клітинку слова, а з кінця — на наступне незаповнене
 * слово. Backspace стирає й відступає.
 */
export function CrosswordPlay({ info, question, questionIndex, paused, timeUp, closed = false, send, deadline = null }: PuzzlePlayProps) {
  const board = usePuzzleBoard(info, questionIndex, send, deadline);
  const [sel, setSel] = useState<{ cell: number; dir: Dir } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const puzzle = question.puzzle?.kind === 'crossword' ? question.puzzle : null;
  const words = puzzle === null ? [] : wordsOf(puzzle);
  const off = paused || timeUp || board.status === 'time_over' || closed || !info.canEdit || info.done;
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

  /** Поле знову містить лише заглушку: наступний символ і Backspace знову видно як зміну. */
  const reset = (el: HTMLInputElement) => {
    el.value = SENTINEL;
    if (document.activeElement === el) el.setSelectionRange(SENTINEL.length, SENTINEL.length);
  };

  // Композиція (IME, клавіатури з передбаченням): проміжні значення поля нічого не пишуть — літери йдуть один раз, на її кінці.
  const onCompositionStart = () => {
    composing.current = true;
  };
  const onCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    composing.current = false;
    const text = event.data ?? '';
    write(text !== '' ? text : event.currentTarget.value.split(SENTINEL).join(''));
    reset(event.currentTarget);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (composing.current || (event.nativeEvent as InputEvent).isComposing === true) return;
    const value = event.target.value;
    // Стирання — лише коли поле порожнє (заглушку стерли); заглушку, замінену літерою, вписуємо.
    if (value === '') erase();
    else {
      const text = value.split(SENTINEL).join('');
      if (text !== '') write(text);
    }
    reset(event.target);
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
      <p className={activeWord !== undefined && wordFilled(activeWord.cells, board.cells) ? 'crossword-active is-filled' : 'crossword-active'} dir="auto">
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
                className={`crossword-play-cell${state}${byClass(info.mask, i, info.members)}`}
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
          defaultValue={SENTINEL}
          onChange={onChange}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
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
      <Legend members={info.members} />
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
                    <button
                      type="button"
                      className={`crossword-clue${wordFilled(w.cells, board.cells) ? ' is-filled' : ''}${activeWord?.dir === w.dir && activeWord.number === w.number ? ' is-active' : ''}`}
                      aria-current={activeWord?.dir === w.dir && activeWord.number === w.number ? 'true' : undefined}
                      aria-disabled={off}
                      onClick={() => pick(firstEmpty(w, board.cells), w.dir)}
                      dir="auto"
                    >
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

/** Понад стільки мініатюр сцена показує їх сторінками по черзі (до 40 мініатюра лишається не меншою за ~90 px на 1600×900). */
export const PUZZLE_PAGE_SIZE = 40;
/** На розкритті половину сцени займає розв'язок, а мініатюри несуть значення: сторінка менша. */
export const PUZZLE_REVEAL_PAGE_SIZE = 24;
export const PUZZLE_PAGE_MS = 8000;

/** Щільні мініатюри (дрібніший підпис): понад стільки дошок на сторінці; на розкритті — удвічі менше. */
export const PUZZLE_DENSE = 24;

/**
 * Стовпці й рядки мініатюр для n дошок: найбільша сітка, що вміщається на сцені 1600×900 (до розкриття — уся ширина під
 * заголовком, ≈ 1440×610; на розкритті — праворуч від розв'язку, ≈ 930×680). Від сітки віднімаються підпис (ім'я й поступ —
 * два рядки ≈ 54 px, щільний — дрібнішим шрифтом ≈ 44 px), поля й проміжок. Сама розкладка тягнеться за екраном (CSS), тут — лише стовпці й рядки.
 */
export function puzzleGrid(n: number, reveal: boolean): { cols: number; rows: number; dense: boolean } {
  const dense = n > (reveal ? PUZZLE_DENSE / 2 : PUZZLE_DENSE);
  const [w, h] = reveal ? [930, 680] : [1440, 610];
  const caption = dense ? 44 : 54;
  let best = { cols: 1, rows: Math.max(1, n), size: -Infinity };
  for (let cols = 1; cols <= Math.max(1, n); cols += 1) {
    const rows = Math.max(1, Math.ceil(n / cols));
    const size = Math.min(w / cols - 26, h / rows - caption - 26);
    if (size > best.size) best = { cols, rows, size };
  }
  return { cols: best.cols, rows: best.rows, dense };
}

/** Поточна сторінка мініатюр: понад size сторінки міняються кожні PUZZLE_PAGE_MS. */
export function usePage(count: number, size: number, enabled: boolean): number {
  const pages = enabled ? pageCount(count, size) : 1;
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), PUZZLE_PAGE_MS);
    return () => clearInterval(id);
  }, [pages]);
  return pages <= 1 ? 0 : page % pages;
}

const sizeOf = (puzzle: PublicPuzzle) => (puzzle.kind === 'sudoku' ? { w: SUDOKU_SIDE, h: SUDOKU_SIDE } : { w: puzzle.width, h: puzzle.height });

/** Межі блоків 2×3 судоку для клітинки i. */
function boxEdges(i: number): string {
  const row = Math.floor(i / SUDOKU_SIDE);
  const col = i % SUDOKU_SIDE;
  return `${col === 2 ? ' is-box-end' : ''}${row === 1 || row === 3 ? ' is-box-bottom' : ''}`;
}

/** Клітинки, від яких залежить оцінка: кросворд з ключем — ключові, інакше null (усі для вписування). */
function scoredSet(puzzle: PublicPuzzle): ReadonlySet<number> | null {
  return puzzle.kind === 'crossword' && puzzle.mode === 'key' && puzzle.keyCells.length > 0 ? new Set(puzzle.keyCells) : null;
}

interface ThumbProps {
  board: PuzzleBoardView;
  puzzle: PublicPuzzle;
  solution: readonly string[] | null;
  reveal: boolean;
}

/**
 * Мініатюра однієї дошки. Клітинка — колір того, хто вписав (соло — колір гравця за його id, команда — учасника з board.members;
 * 'x' — учасника вже немає); задані цифри судоку — сірі, блоки кросворду — темні. Значення — лише коли вони є в дошці (пульт завжди,
 * сцена — на розкритті); на розкритті хибні вписані клітинки — у червоній рамці. Картка не розтягується: сітка й підписи компактно
 * посередині своєї комірки. «Готово» — нейтральна позначка (зелена лише в розв'язаній сітці); на розкритті сітка без «Готово» —
 * пунктирна й притлумлена. Остання вписана клітинка коротко спалахує.
 */
function Thumb({ board, puzzle, solution, reveal }: ThumbProps) {
  const { w, h } = sizeOf(puzzle);
  const team = board.members.length > 0;
  const keys = puzzle.kind === 'crossword' ? new Set(puzzle.keyCells) : null;
  const scored = scoredSet(puzzle);
  const classes = [
    'puzzle-thumb',
    team ? '' : `by-${board.tone}`,
    team && board.members.length > 1 ? 'has-members' : '',
    board.done ? 'is-done' : '',
    reveal ? 'is-reveal' : '',
    board.solved === true ? 'is-solved' : '',
    board.solved === false ? 'is-unsolved' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes} style={{ '--gw': w, '--gh': h } as CSSProperties}>
      <div className="puzzle-thumb-card">
        <div className={`puzzle-mini is-${puzzle.kind}`} style={{ '--cols': w, '--rows': h } as CSSProperties} dir="ltr" aria-hidden="true">
          {Array.from({ length: w * h }, (_, i) => {
            const m = board.mask[i] ?? '0';
            const block = m === '#';
            const given = m === 'g';
            const filled = (m >= '1' && m <= '9') || m === 'x';
            const value = board.cells === null || block ? '' : given ? (puzzle.kind === 'sudoku' ? (puzzle.givens[i] ?? '') : '') : (board.cells[i] ?? '');
            const wrong = reveal && solution !== null && filled && value !== '' && (scored === null || scored.has(i)) && value !== solution[i];
            const cls = [
              'puzzle-thumb-cell',
              block ? 'is-block' : '',
              given ? 'is-given' : '',
              filled ? 'is-filled' : '',
              filled && team ? `by-${m}` : '',
              !reveal && filled && board.last === i ? 'is-last' : '',
              wrong ? 'is-wrong' : '',
              keys?.has(i) === true ? 'is-key' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <span key={i} className={`${cls}${puzzle.kind === 'sudoku' ? boxEdges(i) : ''}`}>
                {value}
              </span>
            );
          })}
        </div>
        <p className="puzzle-thumb-name" dir="auto" title={board.nickname}>
          {board.nickname}
        </p>
        <p className="puzzle-thumb-caption">
          <span className="puzzle-thumb-count">
            {board.filled} / {board.total}
          </span>
          {board.done && (
            <span className="puzzle-thumb-done" role="img" aria-label={t('puzzleDone')} title={t('puzzleDone')}>
              ✓
            </span>
          )}
          {board.points !== null && board.points > 0 && <span className="score">{signed(board.points)}</span>}
        </p>
        {team && board.members.length > 1 && (
          <p className="puzzle-thumb-members">
            {board.members.map((member) => (
              <span key={member.id} className={`by-${member.tone}`} dir="auto" title={member.nickname}>
                {member.nickname}
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

/** Розмір сторінки мініатюр для n дошок: сторінки рівні (45 → 23 + 22), а не повна й майже порожня. */
export function puzzlePageSize(n: number, reveal: boolean): number {
  return evenPageSize(n, reveal ? PUZZLE_REVEAL_PAGE_SIZE : PUZZLE_PAGE_SIZE);
}

/**
 * Мініатюри сіток усіх гравців (команд). Сцена й інші бачать лише маски (без значень, cells === null); пульт — значення наживо.
 * На сцені мініатюри займають усю решту екрана: стовпці й рядки — за кількістю дошок (puzzleGrid), понад 40 (на розкритті понад 24) —
 * рівні сторінки по черзі. Кольори й учасників несе сама дошка (tone, members), тож вони не залежать від сторінки чи порядку.
 * Пульт (host) — звичайна сітка мініатюр без сторінок.
 */
export function PuzzleBoards({ info, puzzle, reveal, host = false }: { info: PuzzleInfo; puzzle: PublicPuzzle; reveal: boolean; host?: boolean }) {
  const size = puzzlePageSize(info.boards.length, reveal);
  const page = usePage(info.boards.length, size, !host);
  const shown = host ? info.boards : pageSlice(info.boards, page, size);
  const grid = puzzleGrid(shown.length, reveal);
  return (
    <div className={host ? 'puzzle-boards-fit is-host' : grid.dense ? 'puzzle-boards-fit is-dense' : 'puzzle-boards-fit'}>
      <ul className="puzzle-boards" style={host ? undefined : ({ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties)}>
        {shown.map((board) => (
          <Thumb key={board.playerId} board={board} puzzle={puzzle} solution={info.solution} reveal={reveal} />
        ))}
      </ul>
    </div>
  );
}

/** Літери слова кросворду з розв'язку. */
function wordText(puzzle: Crossword, solution: readonly string[], word: Crossword['words'][number]): string {
  let text = '';
  for (let k = 0; k < word.length; k += 1) {
    const at = (word.row + (word.dir === 'down' ? k : 0)) * puzzle.width + word.col + (word.dir === 'across' ? k : 0);
    text += solution[at] ?? '';
  }
  return text.toLocaleUpperCase('uk');
}

/**
 * Правильний розв'язок: велика сітка; у кросворді ще й слова з підказками (по горизонталі, по вертикалі), у режимі ключа — ключове
 * слово великими літерами. Сцена — на розкритті, пульт — завжди.
 */
export function PuzzleSolution({ puzzle, solution }: { puzzle: PublicPuzzle; solution: readonly string[] }) {
  const { w, h } = sizeOf(puzzle);
  const key = puzzle.kind === 'crossword' && puzzle.mode === 'key' && puzzle.keyCells.length > 0 ? puzzle.keyCells.map((i) => solution[i] ?? '').join('').toLocaleUpperCase('uk') : null;
  return (
    <figure className="puzzle-solution">
      <figcaption className="meta">{t('puzzleSolution')}</figcaption>
      {key !== null && (
        <p className="puzzle-key-word">
          <span className="meta">{t('crosswordModeKey')}</span> <strong dir="auto">{key}</strong>
        </p>
      )}
      <div className="puzzle-solution-fit" style={{ '--gw': w, '--gh': h } as CSSProperties}>
        <StaticGrid puzzle={puzzle} values={solution} />
      </div>
      {puzzle.kind === 'crossword' && (
        <div className="puzzle-words">
          {(['across', 'down'] as const).map((dir) => {
            const words = puzzle.words.filter((word) => word.dir === dir);
            return (
              words.length > 0 && (
                <section key={dir}>
                  <h3 className="meta">{t(dir === 'across' ? 'crosswordAcross' : 'crosswordDown')}</h3>
                  <ol>
                    {words.map((word) => (
                      <li key={`${word.number}-${dir}`}>
                        <span className="crossword-n">{word.number}.</span> <strong dir="auto">{wordText(puzzle, solution, word)}</strong> <span dir="auto">{word.clue}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )
            );
          })}
        </div>
      )}
    </figure>
  );
}

/**
 * Фінальна сітка гравця (команди) в історії: компактна, задані цифри сірі, хибні вписані — червоні; у кросворді з ключем —
 * ключове слово гравця; «Готово ✓», якщо сітку зафіксували самі (а не кінець часу).
 */
export function PuzzleHistoryGrid({ answer, question, playerKey }: { answer: PuzzleAnswer; question: Question; playerKey?: string }) {
  if (question.type !== 'sudoku' && question.type !== 'crossword') return null;
  const layout = question.type === 'crossword' ? question.layout : null;
  const w = question.type === 'sudoku' ? SUDOKU_SIDE : (layout?.width ?? 0);
  const h = question.type === 'sudoku' ? SUDOKU_SIDE : (layout?.height ?? 0);
  const chars = [...answer.grid];
  if (w === 0 || chars.length !== w * h) return null;
  const right = question.type === 'sudoku' ? [...question.solution] : layout === null ? [] : crosswordCells(layout, question.entries).map((ch) => ch ?? '');
  const keys = new Set(question.type === 'crossword' && question.mode === 'key' ? (layout?.keyCells ?? []) : []);
  return (
    <div className="puzzle-history">
      <div className={`puzzle-mini puzzle-history-grid is-${question.type}`} style={{ '--cols': w, '--rows': h } as CSSProperties} dir="ltr" aria-hidden="true">
        {chars.map((ch, i) => {
          const given = question.type === 'sudoku' && question.givens[i] !== '0';
          const block = question.type === 'crossword' && ch === '#';
          const value = ch === '0' || ch === '.' || ch === '#' ? '' : ch;
          const wrong = !given && !block && value !== '' && (keys.size === 0 || keys.has(i)) && value !== right[i];
          const cls = ['puzzle-thumb-cell', block ? 'is-block' : '', given ? 'is-given' : '', !given && value !== '' ? 'is-filled' : '', wrong ? 'is-wrong' : '', keys.has(i) ? 'is-key' : ''].filter(Boolean).join(' ');
          return (
            <span key={i} className={`${cls}${question.type === 'sudoku' ? boxEdges(i) : ''}`}>
              {value}
            </span>
          );
        })}
      </div>
      {playerKey !== undefined && (
        <p className="meta puzzle-history-key">
          {t('crosswordModeKey')}: <strong dir="auto">{playerKey.replace(/\./g, '·').toLocaleUpperCase('uk')}</strong>
        </p>
      )}
      {answer.done === true && <span className="tag puzzle-history-done">{`${t('puzzleDone')} ✓`}</span>}
    </div>
  );
}
