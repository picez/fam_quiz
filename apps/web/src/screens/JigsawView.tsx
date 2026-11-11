import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject } from 'react';
import { aspectRatio, jigsawCrop, jigsawSides, type JigsawBoardView, type JigsawInfo, type PlayerJigsaw, type PublicJigsaw, type PublicQuestion } from '@quiz/shared';
import { secondsText, signed } from '../format';
import { t } from '../i18n';
import { piecePad, piecePath } from '../live/jigsaw-shape';
import type { Send } from '../live/types';
import { useJigsaw, type JigsawModel } from '../live/useJigsaw';
import { puzzleGrid, puzzlePageSize, usePage } from './PuzzleView';

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

/** Рамка мініатюри в умовних одиницях: ширина THUMB_W, висота — за співвідношенням; шматочки — piecePath у тих самих одиницях. */
const THUMB_W = 1000;
/** Обрізане фото для мініатюр — стільки пікселів завширшки (зменшене один раз на запитання): чітко на найбільшій мініатюрі 1600×900 і дешево для 40 дошок. */
export const JIGSAW_THUMB_PX = 640;
/** Рядків таблиці часу на сторінці сцени (понад — рівні сторінки по черзі, як мініатюри). */
export const JIGSAW_TABLE_PAGE = 12;

/** Спільне для всіх мініатюр запитання: рамка, шлях кожного шматочка на своєму місці, лінії розрізу одним шляхом. */
interface ThumbGeometry {
  w: number;
  h: number;
  paths: string[];
  cuts: string;
}

function thumbGeometry(aspect: PublicJigsaw['aspect'], rows: number, cols: number, tabs: string): ThumbGeometry {
  const w = THUMB_W;
  const h = Math.round((THUMB_W / aspectRatio(aspect)) * 100) / 100;
  const cw = w / cols;
  const ch = h / rows;
  const paths = Array.from({ length: rows * cols }, (_, k) => piecePath(jigsawSides(rows, cols, tabs, k), cw, ch, (k % cols) * cw, Math.floor(k / cols) * ch));
  return { w, h, paths, cuts: paths.join(' ') };
}

/** Фото в одиницях рамки мініатюри: href і прямокутник, у який його покласти (зменшена обрізана копія — уся рамка). */
interface ThumbPhoto {
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Фото для мініатюр одне на всі дошки: обрізана рамка, зменшена до JIGSAW_THUMB_PX на canvas (JPEG data URL), — браузер декодує
 * маленьку картинку, а не повне фото на кожну дошку. Якщо canvas недоступний чи «забруднений» (фото з іншого origin) — саме фото,
 * зсунуте й збільшене так, щоб рамка jigsawCrop лягла на мініатюру. null — фото ще не завантажилось.
 */
function useThumbPhoto(jigsaw: PublicJigsaw, geometry: ThumbGeometry): ThumbPhoto | null {
  const image = usePhoto(jigsaw.photo);
  const crop = useCrop(image, jigsaw);
  return useMemo(() => {
    if (image === null || crop === null) return null;
    const { w, h } = geometry;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.min(JIGSAW_THUMB_PX, Math.round(crop.sw)));
      canvas.height = Math.max(1, Math.round((canvas.width * h) / w));
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('no canvas');
      ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
      return { href: canvas.toDataURL('image/jpeg', 0.85), x: 0, y: 0, width: w, height: h };
    } catch {
      const scale = w / crop.sw;
      return { href: jigsaw.photo, x: -crop.sx * scale, y: -crop.sy * scale, width: image.naturalWidth * scale, height: image.naturalHeight * scale };
    }
  }, [image, crop, geometry, jigsaw.photo]);
}

const percentOf = (board: JigsawBoardView) => (board.total > 0 ? Math.round((100 * board.placed.length) / board.total) : 0);

interface ThumbProps {
  board: JigsawBoardView;
  geometry: ThumbGeometry;
  photo: ThumbPhoto | null;
  /** Співвідношення рамки для CSS (--gw / --gh). */
  gw: number;
  gh: number;
}

/** Мініатюра не перемальовується, поки її дошка та сама: розсилка приносить нові об'єкти, тож порівнюємо значення. */
function sameThumb(a: ThumbProps, b: ThumbProps): boolean {
  const x = a.board;
  const y = b.board;
  return (
    a.geometry === b.geometry &&
    a.photo === b.photo &&
    a.gw === b.gw &&
    a.gh === b.gh &&
    x.playerId === y.playerId &&
    x.nickname === y.nickname &&
    x.tones === y.tones &&
    x.total === y.total &&
    x.done === y.done &&
    x.timeMs === y.timeMs &&
    x.points === y.points &&
    x.placed.length === y.placed.length &&
    x.placed.every((piece, i) => piece === y.placed[i])
  );
}

/**
 * Мініатюра дошки (SVG): тьмяна рамка з лініями розрізу, поставлені шматочки — одне фото з clipPath із їхніх шляхів (до завантаження
 * фото — сіра заливка тієї ж форми); у командах кожен шматочок обведено кольором того, хто поставив (tones). Під рамкою — нік,
 * відсоток, а в тих, хто склав, — ✓ і час.
 */
export const JigsawThumb = memo(function JigsawThumb({ board, geometry, photo, gw, gh }: ThumbProps) {
  const clipId = `jigsaw-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { w, h, paths, cuts } = geometry;
  const clip = `url(#${clipId})`;
  return (
    <li className={board.done ? 'puzzle-thumb jigsaw-thumb is-done' : 'puzzle-thumb jigsaw-thumb'} data-player={board.playerId} style={{ '--gw': gw, '--gh': gh } as CSSProperties}>
      <div className="puzzle-thumb-card">
        <svg className="jigsaw-thumb-svg" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
          <defs>
            <clipPath id={clipId}>
              {board.placed.map((piece) => (
                <path key={piece} d={paths[piece]} />
              ))}
            </clipPath>
          </defs>
          <rect className="jigsaw-thumb-bed" width={w} height={h} />
          <path className="jigsaw-thumb-cuts" d={cuts} />
          {board.placed.length > 0 &&
            (photo === null ? (
              <rect className="jigsaw-thumb-blank" width={w} height={h} clipPath={clip} />
            ) : (
              <image href={photo.href} x={photo.x} y={photo.y} width={photo.width} height={photo.height} preserveAspectRatio="none" clipPath={clip} />
            ))}
          {board.tones !== null && board.placed.map((piece, i) => <path key={piece} className={`jigsaw-thumb-tone by-${board.tones?.[i] ?? 'x'}`} d={paths[piece]} />)}
          <rect className="jigsaw-thumb-edge" width={w} height={h} />
        </svg>
        <p className="puzzle-thumb-name" dir="auto" title={board.nickname}>
          {board.nickname}
        </p>
        <p className="puzzle-thumb-caption">
          <span className="puzzle-thumb-count">{t('jigsawPercent', { percent: percentOf(board) })}</span>
          {board.done && (
            <span className="puzzle-thumb-done" role="img" aria-label={t('puzzleDone')} title={t('puzzleDone')}>
              ✓
            </span>
          )}
          {/* Бали — у таблиці часу поруч (на розкритті), не в тісному підписі мініатюри. */}
          {board.done && board.timeMs !== null && <span className="jigsaw-thumb-time">{t('jigsawSeconds', { time: secondsText(board.timeMs) })}</span>}
        </p>
      </div>
    </li>
  );
}, sameThumb);

function aspectParts(aspect: PublicJigsaw['aspect']): [number, number] {
  const [a, b] = aspect.split(':').map(Number);
  return [a ?? 1, b ?? 1];
}

/**
 * Мініатюри дошок усіх гравців (команд), як PuzzleBoards: на сцені — уся решта екрана (puzzleGrid), понад 40 — рівні сторінки по
 * черзі (puzzlePageSize, PUZZLE_PAGE_MS); пульт (host) — звичайна сітка без сторінок. Геометрія шматочків і зменшене фото — одні на
 * всі мініатюри; кожна мініатюра перемальовується лише тоді, коли змінилась її дошка.
 */
export function JigsawBoards({ info, jigsaw, reveal = false, host = false }: { info: JigsawInfo; jigsaw: PublicJigsaw; reveal?: boolean; host?: boolean }) {
  const { aspect, rows, cols, tabs } = jigsaw;
  const geometry = useMemo(() => thumbGeometry(aspect, rows, cols, tabs), [aspect, rows, cols, tabs]);
  const photo = useThumbPhoto(jigsaw, geometry);
  const size = puzzlePageSize(info.boards.length, reveal);
  const page = usePage(info.boards.length, size, !host);
  const from = host ? 0 : page * size;
  const shown = host ? info.boards : info.boards.slice(from, from + size);
  const grid = puzzleGrid(shown.length, reveal);
  const [gw, gh] = aspectParts(aspect);
  return (
    <div className={host ? 'puzzle-boards-fit jigsaw-boards is-host' : grid.dense ? 'puzzle-boards-fit jigsaw-boards is-dense' : 'puzzle-boards-fit jigsaw-boards'}>
      <ul className="puzzle-boards" style={host ? undefined : ({ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties)}>
        {shown.map((board) => (
          <JigsawThumb key={board.playerId} board={board} geometry={geometry} photo={photo} gw={gw} gh={gh} />
        ))}
      </ul>
    </div>
  );
}

/** Розмір сторінки таблиці: рівні сторінки (25 → 9 + 8 + 8), а не повна й майже порожня. */
export function jigsawTablePageSize(n: number): number {
  if (n <= JIGSAW_TABLE_PAGE) return Math.max(1, n);
  return Math.ceil(n / Math.ceil(n / JIGSAW_TABLE_PAGE));
}

/**
 * Таблиця часу на розкритті: «місце · хто · час · бали» в порядку дошок (склали — за часом, далі за кількістю шматочків). Місце —
 * лише в тих, хто склав (однаковий час — однакове місце); незавершені — «Не склав · N %». На сцені понад JIGSAW_TABLE_PAGE рядків —
 * сторінки по черзі; на пульті — уся таблиця.
 */
export function JigsawTable({ info, host = false }: { info: JigsawInfo; host?: boolean }) {
  const places = new Map<string, number>();
  info.boards.forEach((board, i) => {
    if (!board.done) return;
    const before = info.boards[i - 1];
    places.set(board.playerId, before !== undefined && before.done && before.timeMs === board.timeMs ? (places.get(before.playerId) ?? i + 1) : i + 1);
  });
  const size = jigsawTablePageSize(info.boards.length);
  const page = usePage(info.boards.length, size, !host);
  const shown = host ? info.boards : info.boards.slice(page * size, page * size + size);
  return (
    <table className={host ? 'jigsaw-table is-host' : 'jigsaw-table'} aria-label={t('jigsawTableLabel')}>
      <thead>
        <tr>
          <th scope="col">{t('jigsawTablePlace')}</th>
          <th scope="col">{t('jigsawTableWho')}</th>
          <th scope="col">{t('jigsawTableTime')}</th>
          <th scope="col">{t('jigsawTablePoints')}</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((board) => (
          <tr key={board.playerId} className={board.done ? 'is-done' : 'is-undone'}>
            <td className="rank">{places.get(board.playerId) ?? '—'}</td>
            <td className="name" dir="auto">
              {board.nickname}
            </td>
            <td className="jigsaw-table-time">{board.done && board.timeMs !== null ? t('jigsawSeconds', { time: secondsText(board.timeMs) }) : t('jigsawUndonePercent', { percent: percentOf(board) })}</td>
            <td className="score">{signed(board.points ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Розкриття на сцені й пульті: велике справжнє фото (тією ж рамкою, що й пазл) і таблиця часу. */
export function JigsawResults({ info, jigsaw, host = false }: { info: JigsawInfo; jigsaw: PublicJigsaw; host?: boolean }) {
  return (
    <>
      <figure className="jigsaw-stage-photo" style={{ '--ar': aspectRatio(jigsaw.aspect) } as CSSProperties}>
        <PhotoImg jigsaw={jigsaw} className="jigsaw-stage-img" alt={t('jigsawPreview')} />
      </figure>
      <div className="jigsaw-stage-table">
        <JigsawTable info={info} host={host} />
      </div>
    </>
  );
}
