import { useCallback, useEffect, useRef, useState } from 'react';

/** Клітинка (0…35) → відсортовані цифри-кандидати, напр. '136'; порожніх записів немає. */
export type PencilMarks = Readonly<Record<number, string>>;

const SIDE = 6;

/** Клітинки того самого рядка, стовпця чи блоку 2×3 (без самої клітинки). */
export function sudokuPeers(cell: number): number[] {
  const [sr, sc] = [Math.floor(cell / SIDE), cell % SIDE];
  const peers: number[] = [];
  for (let i = 0; i < SIDE * SIDE; i += 1) {
    if (i === cell) continue;
    const [r, c] = [Math.floor(i / SIDE), i % SIDE];
    if (r === sr || c === sc || (Math.floor(r / 2) === Math.floor(sr / 2) && Math.floor(c / 3) === Math.floor(sc / 3))) peers.push(i);
  }
  return peers;
}

function withDigits(marks: PencilMarks, cell: number, digits: string): PencilMarks {
  const next = { ...marks };
  if (digits === '') delete next[cell];
  else next[cell] = digits;
  return next;
}

export function togglePencil(marks: PencilMarks, cell: number, digit: string): PencilMarks {
  const have = marks[cell] ?? '';
  const digits = have.includes(digit) ? have.replace(digit, '') : [...have, digit].sort().join('');
  return withDigits(marks, cell, digits);
}

/** Вписано digit у cell: позначки cell зникають, digit зникає з позначок рядка, стовпця й блоку 2×3. */
export function pencilAfterWrite(marks: PencilMarks, cell: number, digit: string): PencilMarks {
  let next = withDigits(marks, cell, '');
  for (const peer of sudokuPeers(cell)) {
    const have = next[peer];
    if (have !== undefined && have.includes(digit)) next = withDigits(next, peer, have.replace(digit, ''));
  }
  return next;
}

const keyOf = (room: string) => `quiz:pencil:${room}`;

export function loadPencil(room: string, tag: string): PencilMarks {
  try {
    const raw = sessionStorage.getItem(keyOf(room));
    if (raw === null) return {};
    const saved = JSON.parse(raw) as { tag?: unknown; marks?: unknown };
    if (saved.tag !== tag || typeof saved.marks !== 'object' || saved.marks === null) return {};
    const marks: Record<number, string> = {};
    for (const [key, value] of Object.entries(saved.marks as Record<string, unknown>)) {
      const cell = Number(key);
      if (Number.isInteger(cell) && cell >= 0 && cell < SIDE * SIDE && typeof value === 'string' && /^[1-6]+$/.test(value)) marks[cell] = value;
    }
    return marks;
  } catch {
    return {};
  }
}

export function savePencil(room: string, tag: string, marks: PencilMarks): void {
  try {
    sessionStorage.setItem(keyOf(room), JSON.stringify({ tag, marks }));
  } catch {
    // Сховище повне чи вимкнене: позначки лишаються лише в пам'яті.
  }
}

/**
 * Олівцеві позначки однієї дошки. Живуть лише на телефоні: у sessionStorage за кімнатою (без room — тільки в пам'яті).
 * Цифра, що з'явилась чи змінилась у клітинці (своя чи товариша), прибирає позначки клітинки й цю цифру з її рядка, стовпця й блоку;
 * стерта цифра позначок не повертає.
 */
export function usePencil(room: string | undefined, tag: string, cells: readonly string[]): { marks: PencilMarks; toggle(cell: number, digit: string): void; clear(cell: number): void } {
  const [marks, setMarks] = useState<PencilMarks>(() => (room === undefined ? {} : loadPencil(room, tag)));
  const latest = useRef(marks);
  const seen = useRef<readonly string[]>([]);

  const apply = useCallback(
    (change: (from: PencilMarks) => PencilMarks) => {
      const next = change(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setMarks(next);
      if (room !== undefined) savePencil(room, tag, next);
    },
    [room, tag],
  );

  useEffect(() => {
    const before = seen.current;
    seen.current = cells;
    const written: [number, string][] = [];
    cells.forEach((value, i) => {
      if (value !== '' && value !== (before[i] ?? '')) written.push([i, value]);
    });
    if (written.length === 0) return;
    apply((from) => written.reduce((acc, [i, value]) => pencilAfterWrite(acc, i, value), from));
  }, [cells, apply]);

  const toggle = useCallback((cell: number, digit: string) => apply((from) => togglePencil(from, cell, digit)), [apply]);
  const clear = useCallback((cell: number) => apply((from) => (from[cell] === undefined ? from : withDigits(from, cell, ''))), [apply]);
  return { marks, toggle, clear };
}
