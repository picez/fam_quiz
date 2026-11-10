// «Головоломки» (28d): кросворд — літери слів, компонувальник сітки, нумерація, ключові клітинки й перевірка розкладки.
// Спільне для схеми, редактора й рушія. LIMITS читається лише всередині функцій: quiz.ts імпортує цей файл.
import { wordLetters } from './letterwords';
import { LIMITS } from './quiz';
import { ladderKey } from './wordladder';

export type CrosswordDir = 'across' | 'down';
/** Слово на сітці: клітинка першої літери й напрямок. */
export interface CrosswordPlacement {
  id: string;
  row: number;
  col: number;
  dir: CrosswordDir;
}
/** Розкладка: клітинка i = row × width + col; keyCells — клітинки ключового слова в порядку його літер ([] без ключа). */
export interface CrosswordLayout {
  width: number;
  height: number;
  words: CrosswordPlacement[];
  keyCells: number[];
}
type Entry = { id: string; answer: string };

const LETTER = /^[а-щьюяєіїґ]$/u;

/** Літери слова кросворду: ladderKey без апострофа; не українське слово чи довжина поза minCrosswordWord…maxCrosswordWord — null. */
export function crosswordLetters(word: string): string[] | null {
  const key = ladderKey(word);
  if (key === null) return null;
  const letters = wordLetters(key);
  if (letters.length < LIMITS.minCrosswordWord || letters.length > LIMITS.maxCrosswordWord) return null;
  return letters;
}

/** Один введений у клітинку символ: NFC, малими; не українська літера (зокрема апостроф) — null. */
export function crosswordLetter(input: string): string | null {
  const ch = input.normalize('NFC').toLocaleLowerCase('uk');
  return LETTER.test(ch) ? ch : null;
}

/** Літери ключового слова: як crosswordLetters, але minCrosswordKey…maxCrosswordKey; інакше — null. */
export function crosswordKeyLetters(key: string): string[] | null {
  const k = ladderKey(key);
  if (k === null) return null;
  const letters = wordLetters(k);
  if (letters.length < LIMITS.minCrosswordKey || letters.length > LIMITS.maxCrosswordKey) return null;
  return letters;
}

const step = (dir: CrosswordDir) => (dir === 'across' ? { dr: 0, dc: 1 } : { dr: 1, dc: 0 });

// ——— Компонувальник ———

/** Клітинка площини: літера й індекси слів за напрямком (-1 — немає). */
interface PlaneCell {
  letter: string;
  across: number;
  down: number;
}
/** Безмежна площина: ключ клітинки — (row + SHIFT) × STRIDE + (col + SHIFT). */
const SHIFT = 64;
const STRIDE = 256;
const at = (row: number, col: number) => (row + SHIFT) * STRIDE + col + SHIFT;

interface Plane {
  cells: Map<number, PlaneCell>;
  placed: (CrosswordPlacement | null)[];
  crossings: number;
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
}
interface Candidate {
  row: number;
  col: number;
  dir: CrosswordDir;
  crossings: number;
  area: number;
}

/** Кандидат допустимий? Повертає перетини й площу рамки після розміщення; null — ні. */
function fit(plane: Plane, letters: string[], row: number, col: number, dir: CrosswordDir): Candidate | null {
  const { dr, dc } = step(dir);
  const n = letters.length;
  if (plane.cells.has(at(row - dr, col - dc)) || plane.cells.has(at(row + dr * n, col + dc * n))) return null;
  let crossings = 0;
  for (let k = 0; k < n; k++) {
    const r = row + dr * k;
    const c = col + dc * k;
    const cell = plane.cells.get(at(r, c));
    if (cell) {
      if (cell.letter !== letters[k] || cell[dir] >= 0) return null;
      crossings++;
    } else if (plane.cells.has(at(r + dc, c + dr)) || plane.cells.has(at(r - dc, c - dr))) return null;
  }
  if (crossings === 0) return null;
  const height = Math.max(plane.maxR, row + dr * (n - 1)) - Math.min(plane.minR, row) + 1;
  const width = Math.max(plane.maxC, col + dc * (n - 1)) - Math.min(plane.minC, col) + 1;
  const side = LIMITS.maxCrosswordSide;
  if (height > side || width > side) return null;
  return { row, col, dir, crossings, area: width * height };
}

/** Кандидат a кращий за b: більше перетинів, менша рамка, менші (row, col), across раніше за down. */
const better = (a: Candidate, b: Candidate) =>
  a.crossings !== b.crossings
    ? a.crossings > b.crossings
    : a.area !== b.area
      ? a.area < b.area
      : a.row !== b.row
        ? a.row < b.row
        : a.col !== b.col
          ? a.col < b.col
          : a.dir === 'across' && b.dir === 'down';

function place(plane: Plane, index: number, id: string, letters: string[], row: number, col: number, dir: CrosswordDir) {
  const { dr, dc } = step(dir);
  for (let k = 0; k < letters.length; k++) {
    const key = at(row + dr * k, col + dc * k);
    const cell = plane.cells.get(key);
    if (cell) {
      cell[dir] = index;
      plane.crossings++;
    } else plane.cells.set(key, { letter: letters[k], across: dir === 'across' ? index : -1, down: dir === 'down' ? index : -1 });
  }
  const end = letters.length - 1;
  plane.minR = Math.min(plane.minR, row);
  plane.maxR = Math.max(plane.maxR, row + dr * end);
  plane.minC = Math.min(plane.minC, col);
  plane.maxC = Math.max(plane.maxC, col + dc * end);
  plane.placed[index] = { id, row, col, dir };
}

function bestFit(plane: Plane, letters: string[]): Candidate | null {
  let best: Candidate | null = null;
  for (const [key, cell] of plane.cells) {
    if (cell.across >= 0 && cell.down >= 0) continue;
    const dir: CrosswordDir = cell.across >= 0 ? 'down' : 'across';
    const row = Math.floor(key / STRIDE) - SHIFT;
    const col = (key % STRIDE) - SHIFT;
    const { dr, dc } = step(dir);
    for (let j = 0; j < letters.length; j++) {
      if (letters[j] !== cell.letter) continue;
      const candidate = fit(plane, letters, row - dr * j, col - dc * j, dir);
      if (candidate && (!best || better(candidate, best))) best = candidate;
    }
  }
  return best;
}

/** Розкладання від одного старту: слово start горизонтально в (0, 0), далі проходи, поки щось кладеться. */
function grow(entries: readonly Entry[], letters: string[][], order: number[], start: number): Plane {
  const plane: Plane = {
    cells: new Map(),
    placed: entries.map(() => null),
    crossings: 0,
    minR: 0,
    maxR: 0,
    minC: 0,
    maxC: 0,
  };
  place(plane, start, entries[start].id, letters[start], 0, 0, 'across');
  for (let progressed = true; progressed; ) {
    progressed = false;
    for (const i of order) {
      if (plane.placed[i]) continue;
      const best = bestFit(plane, letters[i]);
      if (!best) continue;
      place(plane, i, entries[i].id, letters[i], best.row, best.col, best.dir);
      progressed = true;
    }
  }
  return plane;
}

/** Детерміноване компонування до maxCrosswordSide × maxCrosswordSide; слова в розкладці — у порядку entries. */
export function layoutCrossword(
  entries: readonly Entry[],
): { ok: true; layout: CrosswordLayout } | { ok: false; reason: 'word' | 'unplaced'; ids: string[] } {
  const parsed = entries.map((e) => crosswordLetters(e.answer));
  const bad = entries.filter((_, i) => parsed[i] === null).map((e) => e.id);
  if (bad.length > 0 || entries.length === 0) return { ok: false, reason: 'word', ids: bad };
  const letters = parsed as string[][];
  const order = entries.map((_, i) => i).sort((a, b) => letters[b].length - letters[a].length || a - b);
  let best: { plane: Plane; count: number; area: number } | null = null;
  for (const start of order) {
    const plane = grow(entries, letters, order, start);
    const count = plane.placed.filter(Boolean).length;
    const area = (plane.maxR - plane.minR + 1) * (plane.maxC - plane.minC + 1);
    const wins =
      !best ||
      count > best.count ||
      (count === best.count &&
        (plane.crossings > best.plane.crossings || (plane.crossings === best.plane.crossings && area < best.area)));
    if (wins) best = { plane, count, area };
  }
  const { plane } = best!;
  if (best!.count < entries.length) {
    return { ok: false, reason: 'unplaced', ids: entries.filter((_, i) => !plane.placed[i]).map((e) => e.id) };
  }
  return {
    ok: true,
    layout: {
      width: plane.maxC - plane.minC + 1,
      height: plane.maxR - plane.minR + 1,
      words: plane.placed.map((p) => ({ ...p!, row: p!.row - plane.minR, col: p!.col - plane.minC })),
      keyCells: [],
    },
  };
}

// ——— Сітка, нумерація, ключ ———

const lettersById = (entries: readonly Entry[]) => new Map(entries.map((e) => [e.id, crosswordLetters(e.answer)]));

/** Клітинки слова в межах сітки (за межами — пропускаються). */
function wordCells(layout: CrosswordLayout, word: CrosswordPlacement, length: number): number[] {
  const { dr, dc } = step(word.dir);
  const out: number[] = [];
  for (let k = 0; k < length; k++) {
    const r = word.row + dr * k;
    const c = word.col + dc * k;
    if (r >= 0 && r < layout.height && c >= 0 && c < layout.width) out.push(r * layout.width + c);
  }
  return out;
}

/** Літери сітки за клітинкою (null — блок). */
export function crosswordCells(layout: CrosswordLayout, entries: readonly Entry[]): (string | null)[] {
  const cells: (string | null)[] = new Array(layout.width * layout.height).fill(null);
  const byId = lettersById(entries);
  for (const word of layout.words) {
    const letters = byId.get(word.id);
    if (!letters) continue;
    wordCells(layout, word, letters.length).forEach((i, k) => (cells[i] = letters[k]));
  }
  return cells;
}

/** Номери підказок: клітинки-початки в порядку читання; across і down з однієї клітинки мають один номер. */
export function crosswordNumbers(
  layout: CrosswordLayout,
  entries: readonly Entry[],
): { id: string; number: number; dir: CrosswordDir; length: number }[] {
  const byId = lettersById(entries);
  const starts = [...new Set(layout.words.map((w) => w.row * layout.width + w.col))].sort((a, b) => a - b);
  return layout.words
    .map((w) => ({
      id: w.id,
      number: starts.indexOf(w.row * layout.width + w.col) + 1,
      dir: w.dir,
      length: byId.get(w.id)?.length ?? 0,
    }))
    .sort((a, b) => a.number - b.number || (a.dir === b.dir ? 0 : a.dir === 'across' ? -1 : 1));
}

/** Слова кожної клітинки (id). */
function owners(layout: CrosswordLayout, entries: readonly Entry[]): Map<number, string[]> {
  const byId = lettersById(entries);
  const out = new Map<number, string[]>();
  for (const word of layout.words) {
    for (const i of wordCells(layout, word, byId.get(word.id)?.length ?? 0)) {
      const list = out.get(i);
      if (list) list.push(word.id);
      else out.set(i, [word.id]);
    }
  }
  return out;
}

/**
 * Клітинки ключового слова в порядку його літер. Для кожної літери — ще не взята клітинка з нею; перевага:
 * усі її слова ще без ключової клітинки, клітинка не на перетині, порядок читання.
 * Літер не вистачає — { missing }: нестача в порядку ключа (з повторами). Ключ не 3…12 українських літер — { missing: [] }.
 */
export function pickKeyCells(layout: CrosswordLayout, entries: readonly Entry[], key: string): number[] | { missing: string[] } {
  const keyLetters = crosswordKeyLetters(key);
  if (!keyLetters) return { missing: [] };
  const cells = crosswordCells(layout, entries);
  const cellOwners = owners(layout, entries);
  const taken = new Set<number>();
  const used = new Set<string>();
  const picked: number[] = [];
  const missing: string[] = [];
  for (const letter of keyLetters) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== letter || taken.has(i)) continue;
      const own = cellOwners.get(i) ?? [];
      const score = (own.every((id) => !used.has(id)) ? 2 : 0) + (own.length <= 1 ? 1 : 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) {
      missing.push(letter);
      continue;
    }
    taken.add(best);
    picked.push(best);
    for (const id of cellOwners.get(best) ?? []) used.add(id);
  }
  return missing.length > 0 ? { missing } : picked;
}

export type CrosswordLayoutIssue = 'crossword_layout' | 'crossword_key_letters';

/** Перевірка збереженої розкладки й ключових клітинок; null — усе гаразд. Слова й ключ мають бути вже перевірені. */
export function crosswordLayoutIssue(
  layout: CrosswordLayout,
  entries: readonly Entry[],
  key: string | null,
): CrosswordLayoutIssue | null {
  return layoutBroken(layout, entries) ? 'crossword_layout' : keyBroken(layout, entries, key) ? 'crossword_key_letters' : null;
}

const isInt = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

function layoutBroken(layout: CrosswordLayout, entries: readonly Entry[]): boolean {
  const side = LIMITS.maxCrosswordSide;
  const { width, height, words } = layout;
  if (!isInt(width, 1, side) || !isInt(height, 1, side)) return true;
  if (words.length !== entries.length) return true;
  const ids = new Set(entries.map((e) => e.id));
  if (ids.size !== entries.length || new Set(words.map((w) => w.id)).size !== words.length) return true;
  if (!words.every((w) => ids.has(w.id))) return true;

  const byId = lettersById(entries);
  const grid: (string | null)[] = new Array(width * height).fill(null);
  const ownerOf = { across: new Array<number>(width * height).fill(-1), down: new Array<number>(width * height).fill(-1) };
  const placedRuns = new Set<string>();
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    const letters = byId.get(word.id);
    if (!letters || (word.dir !== 'across' && word.dir !== 'down')) return true;
    const n = letters.length;
    const across = word.dir === 'across';
    if (!isInt(word.row, 0, height - (across ? 1 : n)) || !isInt(word.col, 0, width - (across ? n : 1))) return true;
    const cells = wordCells(layout, word, n);
    for (let k = 0; k < n; k++) {
      const i = cells[k];
      if (grid[i] !== null && grid[i] !== letters[k]) return true;
      if (ownerOf[word.dir][i] >= 0) return true;
      grid[i] = letters[k];
      ownerOf[word.dir][i] = w;
    }
    placedRuns.add(`${word.dir}:${cells[0]}:${n}`);
  }

  // Кожен максимальний відрізок ≥ 2 літер у кожному напрямку — рівно якесь слово.
  const runs = new Set<string>();
  const scan = (dir: CrosswordDir, lines: number, length: number, cell: (line: number, k: number) => number) => {
    for (let line = 0; line < lines; line++) {
      let k = 0;
      while (k < length) {
        if (grid[cell(line, k)] === null) {
          k++;
          continue;
        }
        const from = k;
        while (k < length && grid[cell(line, k)] !== null) k++;
        if (k - from >= 2) runs.add(`${dir}:${cell(line, from)}:${k - from}`);
      }
    }
  };
  scan('across', height, width, (r, c) => r * width + c);
  scan('down', width, height, (c, r) => r * width + c);
  if (runs.size !== placedRuns.size || ![...runs].every((r) => placedRuns.has(r))) return true;

  // Зв'язність: слова з'єднані спільними клітинками.
  const linked = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const w = queue.pop()!;
    const dir = words[w].dir;
    const other = dir === 'across' ? ownerOf.down : ownerOf.across;
    for (const i of wordCells(layout, words[w], byId.get(words[w].id)!.length)) {
      const next = other[i];
      if (next >= 0 && !linked.has(next)) {
        linked.add(next);
        queue.push(next);
      }
    }
  }
  return linked.size !== words.length;
}

function keyBroken(layout: CrosswordLayout, entries: readonly Entry[], key: string | null): boolean {
  const { keyCells } = layout;
  if (key === null) return keyCells.length > 0;
  const letters = crosswordKeyLetters(key);
  if (!letters || keyCells.length !== letters.length) return true;
  if (new Set(keyCells).size !== keyCells.length) return true;
  const cells = crosswordCells(layout, entries);
  return keyCells.some((i, k) => !isInt(i, 0, cells.length - 1) || cells[i] !== letters[k]);
}
