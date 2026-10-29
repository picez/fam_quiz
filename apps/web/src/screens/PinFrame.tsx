import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { PublicPin } from '@quiz/shared';
import { t } from '../i18n';
import { NO_ZOOM, PIN_MAX_ZOOM, clampView, pinchView, toImagePoint, zoomAround, type Box, type Mirror, type Point, type ZoomView } from '../pin-zoom';
import { PinBoard, pinSpot } from './PinBoard';

interface Props {
  pin: PublicPin;
  imageUrl: string | null;
  point: { x: number; y: number } | null;
  onPlace: (point: { x: number; y: number }) => void;
  overlay?: ReactNode;
  /** «Бінокль» (12h): вікно мапи в частках основи — рамка відкривається наближеною на нього й показує його межі. */
  focus?: { x: number; y: number; size: number } | null;
}

/** Частка основи у відсотках без хвостів після коми (0,1 + 0,2 → 30%). */
const pct = (share: number) => `${Math.round(share * 10_000) / 100}%`;

/** Рух пальця понад стільки пікселів — уже не дотик, а перетягування. */
const TAP_SLOP = 8;
/** Крок кнопок «＋» / «－». */
const BUTTON_FACTOR = 1.5;

interface Gesture {
  /** Де палець торкнувся (пікселі рамки, без дзеркала). */
  start: Point;
  moved: boolean;
  /** Була друга рука: жест уже не дотик. */
  multi: boolean;
  pan: { view: ZoomView; at: Point } | null;
  pinch: { view: ZoomView; a: Point; b: Point } | null;
}

/** Рамка з наближенням: дві руки — масштаб, один палець на наближеній — зсув, короткий дотик — onPlace(частки). Кнопки «＋», «－», «⤢». */
export function PinFrame({ pin, imageUrl, point, onPlace, overlay, focus = null }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ZoomView>(NO_ZOOM);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);

  const apply = (next: ZoomView) => {
    viewRef.current = next;
    setView(next);
  };
  const box = (): Box => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };
  // «Бінокль»: до першого кадру — наближення 1 / size, вікно заповнює рамку (розмір рамки відомий лише після монтування).
  const fx = focus?.x ?? null;
  const fy = focus?.y ?? null;
  const fsize = focus?.size ?? null;
  useLayoutEffect(() => {
    if (fx === null || fy === null || fsize === null || fsize <= 0) return;
    const b = box();
    const scale = 1 / fsize;
    apply(clampView({ scale, x: -fx * b.width * scale, y: -fy * b.height * scale }, b));
    // box і apply читають лише ref-и.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, fy, fsize]);
  // Під «Дзеркалом» рамка віддзеркалена разом з екраном: x у власних координатах рамки перевертається.
  // «Догори дриґом» (12h) повертає її на 180°: перевертаються обидві осі (з дзеркалом x повертається назад).
  const mirrored = (): Mirror => {
    const frame = frameRef.current;
    const mirror = frame !== null && frame.closest('.is-mirror') !== null;
    const flip = frame !== null && frame.closest('.is-flip') !== null;
    return { x: mirror !== flip, y: flip };
  };
  // Поле вимкнене (пауза, заставка перед стартом): дотики нічого не роблять, як і кнопки.
  const disabled = () => frameRef.current?.closest('fieldset[disabled]') != null;
  const raw = (event: ReactPointerEvent): Point => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  /** Точка у власних координатах рамки (з урахуванням дзеркала) — для наближення й зсуву. */
  const local = (p: Point, b: Box): Point => {
    const axes = mirrored();
    return { x: axes.x ? b.width - p.x : p.x, y: axes.y ? b.height - p.y : p.y };
  };

  const startPan = (at: Point) => {
    if (gesture.current !== null) gesture.current.pan = { view: viewRef.current, at: local(at, box()) };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled()) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const p = raw(event);
    pointers.current.set(event.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { start: p, moved: false, multi: false, pan: null, pinch: null };
      startPan(p);
      return;
    }
    if (gesture.current === null) return;
    gesture.current.multi = true;
    if (pointers.current.size === 2) {
      const b = box();
      const [a0, b0] = [...pointers.current.values()];
      gesture.current.pinch = { view: viewRef.current, a: local(a0, b), b: local(b0, b) };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g === null || !pointers.current.has(event.pointerId)) return;
    const p = raw(event);
    pointers.current.set(event.pointerId, p);
    const b = box();
    if (pointers.current.size >= 2 && g.pinch !== null) {
      const [a1, b1] = [...pointers.current.values()];
      apply(pinchView(g.pinch.view, g.pinch.a, g.pinch.b, local(a1, b), local(b1, b), b));
      return;
    }
    if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_SLOP) g.moved = true;
    if ((g.moved || g.multi) && g.pan !== null) {
      const at = local(p, b);
      apply(clampView({ scale: g.pan.view.scale, x: g.pan.view.x + at.x - g.pan.at.x, y: g.pan.view.y + at.y - g.pan.at.y }, b));
    }
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (g === null || !pointers.current.has(event.pointerId)) return;
    const p = cancelled ? (pointers.current.get(event.pointerId) ?? g.start) : raw(event);
    pointers.current.delete(event.pointerId);
    if (cancelled) g.multi = true;
    if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_SLOP) g.moved = true;
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (!g.moved && !g.multi && !disabled()) onPlace(toImagePoint(viewRef.current, p.x, p.y, box(), mirrored()));
      return;
    }
    // Одна рука лишилася: далі вона зсуває від поточного наближення.
    g.pinch = null;
    const [rest] = [...pointers.current.values()];
    startPan(rest);
  };

  /** Кнопки наближають навколо поставленої точки (вона лишається на місці), без точки — навколо середини рамки. */
  const zoomBy = (factor: number) => {
    const b = box();
    const v = viewRef.current;
    // Власні координати рамки (шар трансформується всередині неї), тож «Дзеркало» вже враховане.
    const anchor = point === null ? { x: b.width / 2, y: b.height / 2 } : { x: v.x + point.x * b.width * v.scale, y: v.y + point.y * b.height * v.scale };
    apply(zoomAround(v, factor, anchor.x, anchor.y, b));
  };

  const unscale = 1 / view.scale;
  return (
    <div className="pin-frame-wrap">
      <div
        ref={frameRef}
        className="pin-frame"
        style={{ aspectRatio: String(pin.aspect), '--pin-aspect': pin.aspect } as CSSProperties}
        role="group"
        aria-label={t('pinFrameLabel')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
      >
        <div className="pin-zoom-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, '--unscale': unscale } as CSSProperties}>
          <PinBoard pin={pin} imageUrl={imageUrl}>
            {overlay}
            {focus !== null && (
              <span className="pin-scope" aria-hidden="true" style={{ left: pct(focus.x), top: pct(focus.y), width: pct(focus.size), height: pct(focus.size) }} />
            )}
            {point !== null && (
              <span
                className="pin-mark is-mine"
                role="img"
                aria-label={t('pinMine')}
                style={{ ...pinSpot(point), transform: `translate(-50%, -50%) scale(${unscale})` }}
              />
            )}
          </PinBoard>
        </div>
      </div>
      {/* Кнопки — поза рамкою: їхні дотики не ставлять точку. */}
      <div className="pin-zoom">
        <button type="button" className="btn btn-icon" aria-label={t('pinZoomIn')} disabled={view.scale >= PIN_MAX_ZOOM} onClick={() => zoomBy(BUTTON_FACTOR)}>
          ＋
        </button>
        <button type="button" className="btn btn-icon" aria-label={t('pinZoomOut')} disabled={view.scale <= 1} onClick={() => zoomBy(1 / BUTTON_FACTOR)}>
          －
        </button>
        <button type="button" className="btn btn-icon" aria-label={t('pinZoomReset')} disabled={view.scale <= 1} onClick={() => apply(NO_ZOOM)}>
          ⤢
        </button>
      </div>
    </div>
  );
}
