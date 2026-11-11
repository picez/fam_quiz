import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { aspectRatio, jigsawCrop, jigsawSides, type PlayerJigsaw, type PublicJigsaw, type PublicQuestion } from '@quiz/shared';
import { secondsText } from '../format';
import { t } from '../i18n';
import { piecePad, piecePath } from '../live/jigsaw-shape';
import type { Send } from '../live/types';
import { useJigsaw, type JigsawModel } from '../live/useJigsaw';

/** Тап: рух менший за стільки пікселів і коротший за стільки мілісекунд — поворот на 90°, а не перетягування. */
export const JIGSAW_TAP_PX = 6;
export const JIGSAW_TAP_MS = 300;
/** Рамка не вища за стільки (CSS px) і за таку частку висоти екрана: під нею має лишитися місце для купки (320×568 — усе без прокрутки). */
export const JIGSAW_FRAME_MAX_H = 340;
export const JIGSAW_FRAME_MAX_VH = 0.45;
/** Шматочків у рядку купки (не менше); поля купки й смуга прокрутки (CSS px). */
export const JIGSAW_PILE_PER_ROW = 4;
const JIGSAW_PILE_CHROME = 28;
/** Ширина, доки розкладку ще не виміряно (і в jsdom): телефон 320 px мінус поля. */
const FALLBACK_WIDTH = 304;

type Crop = ReturnType<typeof jigsawCrop>;

interface Layout {
  /** Рамка (CSS px). */
  w: number;
  h: number;
  /** Ядро шматочка. */
  cw: number;
  ch: number;
  pad: number;
}

function layoutOf(aspect: PublicJigsaw['aspect'], rows: number, cols: number, width: number, viewport: number): Layout {
  const ratio = aspectRatio(aspect);
  const w = Math.max(60, Math.min(width, Math.min(JIGSAW_FRAME_MAX_H, viewport * JIGSAW_FRAME_MAX_VH) * ratio));
  const h = w / ratio;
  const cw = w / cols;
  const ch = h / rows;
  return { w, h, cw, ch, pad: piecePad(cw, ch) };
}

/** Фото завантажується один раз на запитання; null — ще ні (чи не вдалося): шматочки сірі, форма видна. */
function usePhoto(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    const img = new Image();
    let live = true;
    img.onload = () => {
      if (live) setImage(img);
    };
    img.src = src;
    return () => {
      live = false;
      img.onload = null;
    };
  }, [src]);
  return image;
}

/** Висота вікна (і після повороту телефона). */
function useViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight || 640);
  useEffect(() => {
    const measure = () => setHeight(window.innerHeight || 640);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return height;
}

/** Розкладка й обрізання не міняються від руху пальця: ті самі об'єкти, тож шматочки не перемальовуються. */
function useBoardLayout(jigsaw: PublicJigsaw, width: number): Layout {
  const viewport = useViewportHeight();
  return useMemo(() => layoutOf(jigsaw.aspect, jigsaw.rows, jigsaw.cols, width, viewport), [jigsaw.aspect, jigsaw.rows, jigsaw.cols, width, viewport]);
}

function useCrop(image: HTMLImageElement | null, jigsaw: PublicJigsaw): Crop | null {
  const { aspect } = jigsaw;
  const { x, y } = jigsaw.focus;
  return useMemo(() => (image === null || image.naturalWidth === 0 ? null : jigsawCrop(image.naturalWidth, image.naturalHeight, aspect, { x, y })), [image, aspect, x, y]);
}

/** Ширина батька (ResizeObserver); до виміру — FALLBACK_WIDTH. */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

interface PieceProps {
  rows: number;
  cols: number;
  tabs: string;
  piece: number;
  layout: Layout;
  image: HTMLImageElement | null;
  crop: Crop | null;
}

/**
 * Шматочок на canvas: ядро + поле виступів, маска piecePath, з фото — лише своя частина обрізаної рамки.
 * memo: рух пальця перерендерює дошку, але props шматочків (розкладка й обрізання — useMemo) ті самі.
 */
const PieceCanvas = memo(function PieceCanvas({ rows, cols, tabs, piece, layout, image, crop }: PieceProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { w, h, cw, ch, pad } = layout;
  const sw = cw + 2 * pad;
  const sh = ch + 2 * pad;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas === null || ctx === null || typeof Path2D === 'undefined') return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(sw * dpr);
    canvas.height = Math.round(sh * dpr);
    const path = new Path2D(piecePath(jigsawSides(rows, cols, tabs, piece), cw, ch));
    const col = piece % cols;
    const row = Math.floor(piece / cols);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sw, sh);
    ctx.translate(pad, pad);
    ctx.save();
    ctx.clip(path);
    if (image !== null && crop !== null) ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, -col * cw, -row * ch, w, h);
    else {
      ctx.fillStyle = '#5b5560';
      ctx.fill(path);
    }
    ctx.restore();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(20, 16, 24, 0.55)';
    ctx.stroke(path);
  }, [rows, cols, tabs, piece, w, h, cw, ch, pad, sw, sh, image, crop]);
  return <canvas ref={ref} className="jigsaw-canvas" style={{ width: sw, height: sh }} aria-hidden="true" />;
});

/** Рамка з поставленими шматочками (фон — розмітка клітинок; ghost — бліда готова картинка під ними, як на розкритті). */
function Frame({ jigsaw, layout, placed, image, crop, ghost = false, children, frameRef }: {
  jigsaw: PublicJigsaw;
  layout: Layout;
  placed: Iterable<number>;
  image: HTMLImageElement | null;
  crop: Crop | null;
  ghost?: boolean;
  children?: ReactNode;
  frameRef?: Ref<HTMLDivElement>;
}) {
  const { w, h, cw, ch, pad } = layout;
  return (
    <div ref={frameRef} className="jigsaw-frame" role="group" aria-label={t('jigsawFrame')} style={{ width: w, height: h, '--cw': `${cw}px`, '--ch': `${ch}px` } as CSSProperties} dir="ltr">
      {ghost && <PhotoImg jigsaw={jigsaw} className="jigsaw-ghost" alt="" />}
      {[...placed].map((piece) => (
        <div key={piece} className="jigsaw-piece is-placed" data-piece={piece} aria-hidden="true" style={{ left: (piece % jigsaw.cols) * cw - pad, top: Math.floor(piece / jigsaw.cols) * ch - pad }}>
          <PieceCanvas rows={jigsaw.rows} cols={jigsaw.cols} tabs={jigsaw.tabs} piece={piece} layout={layout} image={image} crop={crop} />
        </div>
      ))}
      {children}
    </div>
  );
}

/** Готова картинка тією ж рамкою: cover + object-position = частка запасу, як jigsawCrop. */
function PhotoImg({ jigsaw, className, alt }: { jigsaw: PublicJigsaw; className: string; alt: string }) {
  const [a, b] = jigsaw.aspect.split(':');
  return (
    <img
      className={className}
      src={jigsaw.photo}
      alt={alt}
      draggable={false}
      style={{ aspectRatio: `${a} / ${b}`, objectFit: 'cover', objectPosition: `${jigsaw.focus.x * 100}% ${jigsaw.focus.y * 100}%` }}
    />
  );
}

interface Gesture {
  piece: number;
  id: number;
  sx: number;
  sy: number;
  t: number;
  /** Палець від лівого верхнього кута ядра (CSS px). */
  offX: number;
  offY: number;
  moved: boolean;
}

export interface JigsawPlayProps {
  info: PlayerJigsaw;
  question: PublicQuestion;
  /** Номер запитання в раунді (view.questionIndex) — його чекає сервер у подіях. */
  questionIndex: number;
  /** Від нього — порядок купки й початкові повороти. */
  actorId: string;
  paused: boolean;
  timeUp: boolean;
  send: Send;
  /** Команда: «тримаю» товаришам і їхні блоки. */
  team?: boolean;
  /** Запитання закрив сервер (locked): лише рамка для перегляду, рядок стану — у батька. */
  closed?: boolean;
}

/**
 * «Пазл» (29c) на телефоні: рамка зверху на всю ширину, під нею купка з вертикальною прокруткою (прокручує фон між
 * шматочками, самі шматочки touch-action: none). Тап — поворот на 90°; перетягування — pointer events (палець і миша):
 * відпущений над рамкою лежить, де впав (а біля свого місця прямо — прилипає), поза рамкою — назад у купку.
 * Шматочок, який тримає товариш, притемнений рамкою його кольору й не береться.
 */
export function JigsawPlay({ info, question, questionIndex, actorId, paused, timeUp, send, team = false, closed = false }: JigsawPlayProps) {
  const jigsaw = question.jigsaw;
  if (jigsaw === undefined) return null;
  return <JigsawBoard info={info} jigsaw={jigsaw} questionIndex={questionIndex} actorId={actorId} paused={paused} timeUp={timeUp} send={send} team={team} closed={closed} />;
}

function JigsawBoard({ info, jigsaw, questionIndex, actorId, paused, timeUp, send, team, closed }: Omit<JigsawPlayProps, 'question'> & { jigsaw: PublicJigsaw; team: boolean; closed: boolean }) {
  const model = useJigsaw(info, jigsaw, questionIndex, actorId, send, team);
  const [rootRef, width] = useWidth();
  const layout = useBoardLayout(jigsaw, width);
  const image = usePhoto(jigsaw.photo);
  const crop = useCrop(image, jigsaw);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Шматочок у пальці: лівий верхній кут ядра відносно кореня (CSS px). */
  const [drag, setDrag] = useState<{ piece: number; x: number; y: number } | null>(null);
  const interactive = !closed && !paused && !timeUp && info.canPlace && !info.done;
  const heldTone = new Map(info.held.map((held) => [held.piece, held.tone]));
  const total = jigsaw.rows * jigsaw.cols;

  // Шматочок вислизнув із руки (товариш поставив чи тримає, пауза, кінець часу): жест скасовано.
  useEffect(() => {
    if (drag !== null && (model.holding !== drag.piece || !interactive)) {
      gesture.current = null;
      setDrag(null);
      // Рука порожніє й тут (кінець часу за годинником телефона): «тримаю» більше не йде, шматочок лишається, де лежав.
      if (model.holding === drag.piece) model.drop(drag.piece, model.loose.find((item) => item.piece === drag.piece)?.at ?? null);
    }
  }, [drag, model.holding, interactive]);

  const toRoot = (clientX: number, clientY: number, g: Gesture) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return { x: clientX - g.offX - (rect?.left ?? 0), y: clientY - g.offY - (rect?.top ?? 0) };
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>, piece: number) => {
    if (!interactive || heldTone.has(piece) || gesture.current !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    // Поворот іде навколо центру: центр ядра — центр елемента за будь-якого повороту.
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    gesture.current = { piece, id: event.pointerId, sx: event.clientX, sy: event.clientY, t: Date.now(), offX: event.clientX - (cx - layout.cw / 2), offY: event.clientY - (cy - layout.ch / 2), moved: false };
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g === null || g.id !== event.pointerId) return;
    if (!g.moved) {
      if (Math.hypot(event.clientX - g.sx, event.clientY - g.sy) < JIGSAW_TAP_PX) return;
      g.moved = true;
      model.grab(g.piece);
    }
    setDrag({ piece: g.piece, ...toRoot(event.clientX, event.clientY, g) });
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g === null || g.id !== event.pointerId) return;
    gesture.current = null;
    setDrag(null);
    if (!g.moved) {
      if (Date.now() - g.t < JIGSAW_TAP_MS) model.rotate(g.piece);
      return;
    }
    const rect = frameRef.current?.getBoundingClientRect();
    // Клітинка — з виміряної рамки (не з розрахованої розкладки): так само, як її бачить палець.
    const cellW = rect === undefined ? 0 : rect.width / jigsaw.cols;
    const cellH = rect === undefined ? 0 : rect.height / jigsaw.rows;
    const margin = Math.min(cellW, cellH) / 2;
    const over =
      rect !== undefined && cellW > 0 && cellH > 0 && event.clientX >= rect.left - margin && event.clientX <= rect.right + margin && event.clientY >= rect.top - margin && event.clientY <= rect.bottom + margin;
    if (!over) {
      model.drop(g.piece, null);
      return;
    }
    const round = (value: number) => Math.round(value * 1000) / 1000;
    const x = round((event.clientX - g.offX - rect.left) / cellW);
    const y = round((event.clientY - g.offY - rect.top) / cellH);
    model.drop(g.piece, { x, y });
  };

  const onCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g === null || g.id !== event.pointerId) return;
    gesture.current = null;
    setDrag(null);
    // Лишається, де лежав: лише рука порожніє (і «тримаю» більше не йде).
    model.drop(g.piece, model.loose.find((item) => item.piece === g.piece)?.at ?? null);
  };

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>, piece: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (interactive && !heldTone.has(piece)) model.rotate(piece);
  };

  const pieceEl = (item: JigsawModel['loose'][number], style: CSSProperties, scale = 1) => {
    const tone = heldTone.get(item.piece);
    const dragging = drag?.piece === item.piece;
    return (
      <div
        key={item.piece}
        className={`jigsaw-piece is-loose${tone !== undefined ? ` is-held by-${tone}` : ''}${dragging ? ' is-lifted' : ''}${interactive && tone === undefined ? '' : ' is-off'}`}
        data-piece={item.piece}
        data-rot={item.rot}
        role="button"
        aria-label={tone !== undefined ? t('jigsawPieceHeld', { n: item.piece + 1 }) : t('jigsawPiece', { n: item.piece + 1 })}
        aria-disabled={!interactive || tone !== undefined}
        tabIndex={0}
        onKeyDown={(event) => onKey(event, item.piece)}
        style={{ ...style, width: layout.cw + 2 * layout.pad, height: layout.ch + 2 * layout.pad, transform: `rotate(${item.rot * 90}deg)${scale === 1 ? '' : ` scale(${scale})`}` }}
        onPointerDown={(event) => onDown(event, item.piece)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <PieceCanvas rows={jigsaw.rows} cols={jigsaw.cols} tabs={jigsaw.tabs} piece={item.piece} layout={layout} image={image} crop={crop} />
      </div>
    );
  };

  const onFrame = model.loose.filter((item) => item.at !== null);
  const inPile = model.loose.filter((item) => item.at === null);
  // Купка дрібніша за рамку, щоб у рядок влазило JIGSAW_PILE_PER_ROW шматочків; у пальці шматочок — справжнього розміру.
  const fullSlot = Math.max(layout.cw, layout.ch) + 2 * layout.pad;
  const slot = Math.min(fullSlot, Math.floor((width - JIGSAW_PILE_CHROME - (JIGSAW_PILE_PER_ROW - 1) * 4) / JIGSAW_PILE_PER_ROW));
  const pileScale = slot / fullSlot;
  const lifted = drag === null ? undefined : model.loose.find((item) => item.piece === drag.piece);
  const status = info.done
    ? t('jigsawDoneIn', { time: secondsText(info.timeMs ?? 0) })
    : closed
      ? ''
      : timeUp
        ? t('jigsawTimeUp')
        : model.status === 'offline'
          ? t('jigsawOffline')
          : (model.notice ?? '');

  return (
    <div ref={rootRef} className="jigsaw-play">
      <div className="jigsaw-head">
        <p className="meta jigsaw-progress">{t('jigsawProgress', { placed: model.placed.size, total })}</p>
        {jigsaw.preview && <PhotoImg jigsaw={jigsaw} className="jigsaw-preview" alt={t('jigsawPreview')} />}
      </div>
      <Frame jigsaw={jigsaw} layout={layout} placed={model.placed} image={image} crop={crop} frameRef={frameRef}>
        {!closed && onFrame.map((item) => pieceEl(item, { left: item.at!.x * layout.cw - layout.pad, top: item.at!.y * layout.ch - layout.pad }))}
      </Frame>
      <p className="puzzle-status" role="status" aria-live="polite">
        {status}
      </p>
      {!closed && inPile.length > 0 && (
        <div className="jigsaw-pile" role="group" aria-label={t('jigsawPile')}>
          {inPile.map((item) => (
            <div key={item.piece} className="jigsaw-slot" style={{ width: slot, height: slot }}>
              {pieceEl(item, { left: (slot - layout.cw) / 2 - layout.pad, top: (slot - layout.ch) / 2 - layout.pad }, pileScale)}
            </div>
          ))}
        </div>
      )}
      {lifted !== undefined && drag !== null && (
        <div
          className="jigsaw-piece is-ghost"
          data-dragging={lifted.piece}
          aria-hidden="true"
          style={{ left: drag.x - layout.pad, top: drag.y - layout.pad, width: layout.cw + 2 * layout.pad, height: layout.ch + 2 * layout.pad, transform: `rotate(${lifted.rot * 90}deg)` }}
        >
          <PieceCanvas rows={jigsaw.rows} cols={jigsaw.cols} tabs={jigsaw.tabs} piece={lifted.piece} layout={layout} image={image} crop={crop} />
        </div>
      )}
    </div>
  );
}

/** Розкриття на телефоні: своя рамка з поставленими шматочками поверх блідої готової картинки й підсумок. */
export function JigsawReveal({ mine, question }: { mine: PlayerJigsaw | undefined; question: PublicQuestion }) {
  const jigsaw = question.jigsaw;
  if (jigsaw === undefined) return null;
  return <JigsawRevealBoard mine={mine} jigsaw={jigsaw} />;
}

function JigsawRevealBoard({ mine, jigsaw }: { mine: PlayerJigsaw | undefined; jigsaw: PublicJigsaw }) {
  const [rootRef, width] = useWidth();
  const layout = useBoardLayout(jigsaw, width);
  const image = usePhoto(jigsaw.photo);
  const crop = useCrop(image, jigsaw);
  const total = jigsaw.rows * jigsaw.cols;
  return (
    <div ref={rootRef} className="jigsaw-play jigsaw-reveal">
      <figure className="jigsaw-reveal-part">
        <figcaption className="meta">
          {mine === undefined
            ? t('jigsawPreview')
            : mine.done && mine.timeMs !== null
              ? t('jigsawAnswerDone', { time: secondsText(mine.timeMs) })
              : t('jigsawAnswerPart', { placed: mine.placed.length, total })}
        </figcaption>
        <Frame jigsaw={jigsaw} layout={layout} placed={mine?.placed ?? []} image={image} crop={crop} ghost />
      </figure>
    </div>
  );
}
