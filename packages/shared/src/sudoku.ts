// «Головоломки» (28d): судоку 6×6 з блоками 2×3 — розв'язувач, генератор і перевірка, спільні для схеми, редактора й рушія.
// Сітка — рядок з 36 символів, клітинка i = row × 6 + col; '0' — порожня, '1'…'6' — цифра.

export const SUDOKU_SIZE = 6;
export const SUDOKU_BOX = { rows: 2, cols: 3 } as const;
export const SUDOKU_CELLS = 36;
export const SUDOKU_LEVELS = ['easy', 'medium', 'hard'] as const;
export type SudokuLevel = (typeof SUDOKU_LEVELS)[number];
/** Цільова кількість заданих цифр за складністю. */
export const SUDOKU_GIVENS: Record<SudokuLevel, number> = { easy: 20, medium: 16, hard: 12 };
export const EMPTY_SUDOKU = '0'.repeat(SUDOKU_CELLS);

/** Усі шість цифр бітами 1…6 (біт d — цифра d). */
const ALL = 0b1111110;
/** Проходів «важкої» генерації після першого, якщо перший зупинився вище HARD_RETRY_ABOVE заданих. */
const HARD_RETRIES = 20;
const HARD_RETRY_ABOVE = 13;

const rowOf = (i: number) => Math.floor(i / SUDOKU_SIZE);
const colOf = (i: number) => i % SUDOKU_SIZE;
const boxOf = (i: number) =>
  Math.floor(rowOf(i) / SUDOKU_BOX.rows) * (SUDOKU_SIZE / SUDOKU_BOX.cols) + Math.floor(colOf(i) / SUDOKU_BOX.cols);
const ROW = Array.from({ length: SUDOKU_CELLS }, (_, i) => rowOf(i));
const COL = Array.from({ length: SUDOKU_CELLS }, (_, i) => colOf(i));
const BOX = Array.from({ length: SUDOKU_CELLS }, (_, i) => boxOf(i));
/** Клітинки кожної групи: 6 рядків, 6 стовпців, 6 блоків. */
const UNITS: number[][] = [
  ...Array.from({ length: SUDOKU_SIZE }, (_, u) => ROW.flatMap((r, i) => (r === u ? [i] : []))),
  ...Array.from({ length: SUDOKU_SIZE }, (_, u) => COL.flatMap((c, i) => (c === u ? [i] : []))),
  ...Array.from({ length: SUDOKU_SIZE }, (_, u) => BOX.flatMap((b, i) => (b === u ? [i] : []))),
];

const bitCount = (mask: number) => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};

/** Детермінований генератор випадкових чисел [0, 1) — mulberry32. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function isSudokuGrid(grid: string): boolean {
  return /^[0-6]{36}$/.test(grid);
}

/** Клітинки з цифрою, що повторюється в рядку, стовпці чи блоці (за зростанням). */
export function sudokuConflicts(grid: string): number[] {
  const bad = new Set<number>();
  for (const unit of UNITS) {
    const seen = new Map<string, number[]>();
    for (const i of unit) {
      const ch = grid[i];
      if (ch === '0') continue;
      const list = seen.get(ch);
      if (list) list.push(i);
      else seen.set(ch, [i]);
    }
    for (const list of seen.values()) if (list.length > 1) for (const i of list) bad.add(i);
  }
  return [...bad].sort((a, b) => a - b);
}

/** Цифри сітки (0 — порожньо) і маски рядків, стовпців, блоків; null — заданий повтор. */
function parse(grid: string): { cells: number[]; rows: number[]; cols: number[]; boxes: number[] } | null {
  const cells = new Array<number>(SUDOKU_CELLS);
  const rows = new Array<number>(SUDOKU_SIZE).fill(0);
  const cols = new Array<number>(SUDOKU_SIZE).fill(0);
  const boxes = new Array<number>(SUDOKU_SIZE).fill(0);
  for (let i = 0; i < SUDOKU_CELLS; i++) {
    const d = grid.charCodeAt(i) - 48;
    cells[i] = d;
    if (d === 0) continue;
    const bit = 1 << d;
    if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return null;
    rows[ROW[i]] |= bit;
    cols[COL[i]] |= bit;
    boxes[BOX[i]] |= bit;
  }
  return { cells, rows, cols, boxes };
}

/** Пошук з поверненням (MRV) до limit розв'язків; order — порядок цифр-кандидатів (для генератора). */
function search(grid: string, limit: number, order?: () => number[]): { count: number; solution: string | null } {
  if (!isSudokuGrid(grid)) return { count: 0, solution: null };
  const state = parse(grid);
  if (!state) return { count: 0, solution: null };
  const { cells, rows, cols, boxes } = state;
  let count = 0;
  let solution: string | null = null;
  const step = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 7;
    for (let i = 0; i < SUDOKU_CELLS; i++) {
      if (cells[i] !== 0) continue;
      const mask = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const n = bitCount(mask);
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (solution === null) solution = cells.join('');
      return count >= limit;
    }
    if (bestCount === 0) return false;
    const r = ROW[best];
    const c = COL[best];
    const b = BOX[best];
    for (const d of order ? order() : [1, 2, 3, 4, 5, 6]) {
      const bit = 1 << d;
      if (!(bestMask & bit)) continue;
      cells[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      const stop = step();
      cells[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      if (stop) return true;
    }
    return false;
  };
  if (limit > 0) step();
  return { count, solution };
}

/** Кількість розв'язків до limit і перший знайдений розв'язок; сітка з повтором заданих — { 0, null } без пошуку. */
export function countSudoku(grid: string, limit = 2): { count: number; solution: string | null } {
  return search(grid, limit);
}

/** Чи розв'язується сітка самими «одиночками»: голими (одна цифра в клітинці) і прихованими (одне місце для цифри в групі). */
export function singlesSolvable(grid: string): boolean {
  if (!isSudokuGrid(grid)) return false;
  const state = parse(grid);
  if (!state) return false;
  const { cells, rows, cols, boxes } = state;
  const place = (i: number, d: number) => {
    const bit = 1 << d;
    cells[i] = d;
    rows[ROW[i]] |= bit;
    cols[COL[i]] |= bit;
    boxes[BOX[i]] |= bit;
  };
  const candidates = (i: number) => ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
  for (;;) {
    let progress = false;
    let empty = 0;
    for (let i = 0; i < SUDOKU_CELLS; i++) {
      if (cells[i] !== 0) continue;
      empty++;
      const mask = candidates(i);
      if (mask === 0) return false;
      if (bitCount(mask) === 1) {
        place(i, 31 - Math.clz32(mask));
        progress = true;
      }
    }
    if (empty === 0) return true;
    for (const unit of UNITS) {
      for (let d = 1; d <= SUDOKU_SIZE; d++) {
        const bit = 1 << d;
        let spot = -1;
        let spots = 0;
        let placed = false;
        for (const i of unit) {
          if (cells[i] === d) placed = true;
          else if (cells[i] === 0 && candidates(i) & bit) {
            spot = i;
            spots++;
          }
        }
        if (!placed && spots === 1) {
          place(spot, d);
          progress = true;
        }
      }
    }
    if (!progress) return false;
  }
}

const givensIn = (cells: string[]) => cells.reduce((n, ch) => (ch === '0' ? n : n + 1), 0);

/** Один прохід прибирання: клітинки в перемішаному rng порядку, поки заданих більше за ціль; лише зі збереженням єдиності. */
function removePass(solution: string, level: SudokuLevel, rng: () => number): string {
  const cells = [...solution];
  const target = SUDOKU_GIVENS[level];
  let left = SUDOKU_CELLS;
  for (const i of shuffle(Array.from({ length: SUDOKU_CELLS }, (_, k) => k), rng)) {
    if (left <= target) break;
    const digit = cells[i];
    cells[i] = '0';
    const grid = cells.join('');
    if (countSudoku(grid, 2).count === 1 && (level !== 'easy' || singlesSolvable(grid))) left--;
    else cells[i] = digit;
  }
  return cells.join('');
}

/** Детермінована сітка за seed і складністю: однакові seed і level завжди дають ту саму сітку. */
export function generateSudoku(seed: number, level: SudokuLevel): { givens: string; solution: string } {
  const rng = seededRng(seed);
  const solution = search(EMPTY_SUDOKU, 1, () => shuffle([1, 2, 3, 4, 5, 6], rng)).solution!;
  let givens = removePass(solution, level, rng);
  if (level === 'hard') {
    let best = givensIn([...givens]);
    for (let pass = 0; pass < HARD_RETRIES && best > HARD_RETRY_ABOVE; pass++) {
      const next = removePass(solution, level, rng);
      const n = givensIn([...next]);
      if (n < best) {
        givens = next;
        best = n;
      }
    }
  }
  return { givens, solution };
}

export type SudokuIssue = 'sudoku_grid' | 'sudoku_conflict' | 'sudoku_none' | 'sudoku_many' | 'sudoku_solution';

/** Перевірка цифр ведучого: формат, повтор, жодного чи кілька розв'язків, розв'язок не той; null — усе гаразд. */
export function sudokuIssue(givens: string, solution: string): SudokuIssue | null {
  if (!isSudokuGrid(givens) || !/^[1-6]{36}$/.test(solution)) return 'sudoku_grid';
  if (sudokuConflicts(givens).length > 0) return 'sudoku_conflict';
  const found = countSudoku(givens, 2);
  if (found.count === 0) return 'sudoku_none';
  if (found.count > 1) return 'sudoku_many';
  if (found.solution !== solution) return 'sudoku_solution';
  for (let i = 0; i < SUDOKU_CELLS; i++) if (givens[i] !== '0' && givens[i] !== solution[i]) return 'sudoku_solution';
  return null;
}
