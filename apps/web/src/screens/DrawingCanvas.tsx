import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DRAWING_ASPECT, DRAWING_BACKGROUND, DRAWING_COLORS, DRAWING_SCALE, DRAWING_WIDTHS, strokePoints, type Stroke } from '@quiz/shared';

interface Props {
  strokes: Stroke[];
  /** Штрих, який художник малює просто зараз і якого ще немає в strokes (малюється поверх). */
  live?: Stroke | null;
  className?: string;
  label: string;
}

/** Ширина до першого виміру (jsdom, прихований контейнер), CSS-пікселі. */
const FALLBACK_WIDTH = 320;

/** Що вже намальовано: скільки штрихів і скільки точок в останньому з них. */
interface Painted {
  /** Намальовані штрихи: усі, крім останнього, мусять лишитися тими самими об'єктами (applyDrawOp їх не міняє). */
  list: Stroke[];
  strokes: number;
  lastPoints: number;
  width: number;
  height: number;
}

const colorOf = (c: number) => DRAWING_COLORS[c] ?? DRAWING_BACKGROUND;

/** Штрих next починається так само, як намальований was: колір, товщина й перші points точок. */
function sameStart(next: Stroke, was: Stroke, points: number): boolean {
  if (next === was) return true;
  if (next.c !== was.c || next.w !== was.w || next.p.length < points * 2) return false;
  for (let i = 0; i < points * 2; i += 1) if (next.p[i] !== was.p[i]) return false;
  return true;
}

/** Малює штрих від точки from (номер точки, не числа); з першої точки — і крапку, щоб штрих з однієї точки був видимий. */
function paint(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number, width: number, height: number) {
  const count = stroke.p.length / 2;
  if (count === 0) return;
  const x = (i: number) => (stroke.p[i * 2]! / DRAWING_SCALE) * width;
  const y = (i: number) => (stroke.p[i * 2 + 1]! / DRAWING_SCALE) * height;
  const line = ((DRAWING_WIDTHS[stroke.w] ?? DRAWING_WIDTHS[0]) / 1000) * width;
  const color = colorOf(stroke.c);
  if (from === 0 && count === 1) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x(0), y(0), line / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const start = Math.max(0, from - 1);
  if (start >= count - 1) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x(start), y(start));
  for (let i = start + 1; i < count; i += 1) ctx.lineTo(x(i), y(i));
  ctx.stroke();
}

/**
 * Полотно малюнка (28c): 4:3, ширина контейнера × devicePixelRatio. Нові точки й штрихи дорисовуються,
 * а все інше (крок назад, очищення, зміна розміру) — перемальовується з нуля.
 */
export function DrawingCanvas({ strokes, live = null, className, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painted = useRef<Painted | null>(null);
  const [cssWidth, setCssWidth] = useState(FALLBACK_WIDTH);
  const all = useMemo(() => (live === null ? strokes : [...strokes, live]), [strokes, live]);

  useEffect(() => {
    const node = canvasRef.current;
    if (node === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (node.clientWidth > 0) setCssWidth((old) => (old === node.clientWidth ? old : node.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const width = Math.round(cssWidth * ratio);
  const height = Math.round(width / DRAWING_ASPECT);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas === null || ctx === null) return;
    const was = painted.current;
    const last = all.length - 1;
    // Дорисувати можна, лише коли старе не змінилося: штрихів не менше, а останній намальований — той самий штрих,
    // що лише виріс (колір, товщина й уже намальовані точки ті самі); інакше, наприклад крок назад і новий штрих
    // в одному рендері, старі пікселі лишилися б.
    const grows =
      was !== null &&
      was.width === width &&
      was.height === height &&
      all.length >= was.strokes &&
      was.list.every((stroke, i) => (i < was.strokes - 1 ? all[i] === stroke : sameStart(all[i]!, stroke, was.lastPoints)));
    if (!grows) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = DRAWING_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
      for (const stroke of all) paint(ctx, stroke, 0, width, height);
    } else {
      if (was.strokes > 0) paint(ctx, all[was.strokes - 1]!, was.lastPoints, width, height);
      for (let i = was.strokes; i < all.length; i += 1) paint(ctx, all[i]!, 0, width, height);
    }
    painted.current = { list: all, strokes: all.length, lastPoints: last < 0 ? 0 : all[last]!.p.length / 2, width, height };
  }, [all, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className === undefined ? 'drawing-canvas' : `drawing-canvas ${className}`}
      role="img"
      aria-label={label}
      dir="ltr"
      width={width}
      height={height}
      data-strokes={all.length}
      data-points={strokePoints(all)}
      style={{ width: '100%', aspectRatio: '4 / 3', touchAction: 'none', display: 'block' }}
    />
  );
}
