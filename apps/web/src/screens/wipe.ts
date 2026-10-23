import { useEffect, useRef, type RefObject } from 'react';

// Чиста логіка туману й бруду; координати — частки розміру зони 0…1.

export const FOG_COLS = 12;
export const FOG_ROWS = 16;
/** true — туман; індекс row * FOG_COLS + col. */
export type FogGrid = boolean[];

export function fullFog(): FogGrid {
  return new Array<boolean>(FOG_COLS * FOG_ROWS).fill(true);
}

/** Очищає клітинки в радіусі radius клітинок від точки (x, y). Без змін повертає ту саму сітку. */
export function wipeFog(grid: FogGrid, x: number, y: number, radius = 1.5): FogGrid {
  const cx = x * FOG_COLS;
  const cy = y * FOG_ROWS;
  const r2 = radius * radius;
  let next: FogGrid | null = null;
  const minRow = Math.max(0, Math.floor(cy - radius));
  const maxRow = Math.min(FOG_ROWS - 1, Math.floor(cy + radius));
  const minCol = Math.max(0, Math.floor(cx - radius));
  const maxCol = Math.min(FOG_COLS - 1, Math.floor(cx + radius));
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const i = row * FOG_COLS + col;
      if (!grid[i]) continue;
      const dx = col + 0.5 - cx;
      const dy = row + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      next ??= [...grid];
      next[i] = false;
    }
  }
  return next ?? grid;
}

/** Пляма бруду: центр (x, y) і розмір у частках зони; left — скільки лишилося, 1 → 0. */
export interface Splat {
  id: number;
  x: number;
  y: number;
  size: number;
  left: number;
}

const SPLAT_STEP = 0.2;

/** Детермінований генератор 0…1 (mulberry32). */
function seeded(seed: number): () => number {
  let a = (seed * 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 6 плям у стабільних місцях для цього запитання (псевдовипадково від seed).
 * Кожна — у своїй комірці сітки 2×3 з невеликим зсувом, тож плями не накриваються.
 */
export function splatsFor(seed: number): Splat[] {
  const rnd = seeded(seed);
  const splats: Splat[] = [];
  for (let i = 0; i < 6; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    splats.push({
      id: i,
      x: 0.3 + col * 0.4 + (rnd() - 0.5) * 0.16,
      y: 0.2 + row * 0.3 + (rnd() - 0.5) * 0.16,
      size: 0.22 + rnd() * 0.08,
      left: 1,
    });
  }
  return splats;
}

/** Кожна пляма, що містить точку, втрачає 0.2; пляма з left ≤ 0 зникає зі списку. Без змін — той самий список. */
export function wipeSplats(splats: Splat[], x: number, y: number): Splat[] {
  let hit = false;
  const next: Splat[] = [];
  for (const s of splats) {
    if (Math.abs(x - s.x) > s.size / 2 || Math.abs(y - s.y) > s.size / 2) {
      next.push(s);
      continue;
    }
    hit = true;
    // Округлення до десятих: 1 − 5 × 0.2 у плаваючій комі не дає рівно 0.
    const left = Math.round((s.left - SPLAT_STEP) * 10) / 10;
    if (left > 0) next.push({ ...s, left });
  }
  return hit ? next : splats;
}

/**
 * Слухає pointermove і touchmove (пасивні) на елементі й віддає точки в частках його розміру.
 * Дотик іде через touchmove (pointermove обривається, коли браузер починає прокрутку),
 * миша (лише з натиснутою кнопкою) й перо — через pointermove.
 */
export function useWipe(ref: RefObject<HTMLElement | null>, onWipe: (x: number, y: number) => void): void {
  const handler = useRef(onWipe);
  handler.current = onWipe;
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const emit = (clientX: number, clientY: number) => {
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const x = (clientX - box.left) / box.width;
      const y = (clientY - box.top) / box.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      handler.current(x, y);
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      // Миша протирає лише з натиснутою кнопкою, а не простим наведенням.
      if (e.pointerType === 'mouse' && e.buttons === 0) return;
      emit(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      // Лише пальці, що рухалися: нерухомий палець не протирає те саме місце знову.
      for (const touch of Array.from(e.changedTouches)) emit(touch.clientX, touch.clientY);
    };
    el.addEventListener('pointermove', onPointer, { passive: true });
    el.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onPointer);
      el.removeEventListener('touchmove', onTouch);
    };
  }, [ref]);
}
