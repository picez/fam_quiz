import type { DecorPhoto, TrophyPhotoFrame, TrophyPhotoPlace, TrophyPhotoStyle } from '@quiz/shared';
import { useEffect, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { RING_TILE, coverCrop } from '../../trophy/decor-layout';
import { CROP_RESET, CROP_SCALE, cropFrameBox, cropShape, panCrop, zoomCrop } from '../crop';

type Crop = DecorPhoto['crop'];

/** Ширина полотна кадрування в CSS px; висота — за пропорцією рамки фото на кубку. */
const VIEW_WIDTH = 280;
/** Крок стрілок — частка ширини полотна. */
const ARROW_STEP = 0.02;
/** Підказка про стрілки в назві полотна: значки, однакові для всіх мов. */
const ARROW_KEYS = '← ↑ → ↓';
/** Радіус заокругленої рамки на кубку (decor-canvas), у пікселях прямокутника фото. */
const ROUNDED_RADIUS = 18;
const TONE: Record<TrophyPhotoStyle, string> = { normal: 'none', bw: 'grayscale(1)', sepia: 'sepia(1)' };

export interface CropDialogProps {
  url: string;
  crop: Crop;
  place: TrophyPhotoPlace;
  frame: TrophyPhotoFrame;
  photoStyle: TrophyPhotoStyle;
  onDone: (crop: Crop) => void;
  onClose: () => void;
}

/**
 * Кадрування одного фото в пропорціях його рамки на кубку (cropFrameBox — та сама, що в decor-canvas): тяг пальцем
 * або стрілки зсувають кадр, повзунок — масштаб. «Готово» віддає кадр, Escape закриває без змін.
 */
export function CropDialog({ url, crop: initial, place, frame, photoStyle, onDone, onClose }: CropDialogProps): JSX.Element {
  const [crop, setCrop] = useState<Crop>(initial);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const box = cropFrameBox(place, frame);
  const shape = cropShape(place, frame);
  const viewHeight = Math.round((VIEW_WIDTH * box.height) / box.width);

  useEffect(() => {
    let live = true;
    const next = new Image();
    next.onload = () => {
      if (live) setImage(next);
    };
    next.src = url;
    return () => {
      live = false;
    };
  }, [url]);

  // Фокус — на повзунку; після закриття — туди, звідки відкрили.
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    zoom.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d') ?? null;
    if (element === null || ctx === null) return;
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.round(VIEW_WIDTH * dpr);
    element.height = Math.round(viewHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW_WIDTH, viewHeight);
    ctx.save();
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(VIEW_WIDTH / 2, viewHeight / 2, Math.min(VIEW_WIDTH, viewHeight) / 2, 0, Math.PI * 2);
    else if (shape === 'rounded') ctx.roundRect(0, 0, VIEW_WIDTH, viewHeight, (ROUNDED_RADIUS * VIEW_WIDTH) / box.width);
    else ctx.rect(0, 0, VIEW_WIDTH, viewHeight);
    ctx.clip();
    ctx.fillStyle = RING_TILE.background;
    ctx.fillRect(0, 0, VIEW_WIDTH, viewHeight);
    if (image !== null) {
      const c = coverCrop(dims(image), box, crop);
      ctx.filter = TONE[photoStyle];
      ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, 0, 0, VIEW_WIDTH, viewHeight);
      ctx.filter = 'none';
    }
    ctx.restore();
  }, [image, crop, box.width, box.height, shape, viewHeight, photoStyle]);

  const viewWidth = () => canvas.current?.getBoundingClientRect().width || VIEW_WIDTH;
  const pan = (dx: number, dy: number, width: number) => {
    if (image === null) return;
    setCrop((value) => panCrop(value, dims(image), box, dx, dy, width));
  };

  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = drag.current;
    if (last === null || last.id !== event.pointerId) return;
    drag.current = { ...last, x: event.clientX, y: event.clientY };
    pan(event.clientX - last.x, event.clientY - last.y, viewWidth());
  };
  const up = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const arrows = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const width = viewWidth();
    const step = ARROW_STEP * width;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[event.key];
    if (d === undefined) return;
    event.preventDefault();
    pan(d[0], d[1], width);
  };

  // Escape і Tab слухаємо на документі: дотик по заголовку чи полю діалогу не повинен вимкнути ні те, ні те.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || dialog.current === null) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('canvas, input, button')).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : index === focusable.length - 1 ? 0 : index + 1;
      event.preventDefault();
      focusable[next]!.focus();
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);

  return createPortal(
    <div className="crop-backdrop">
      <div ref={dialog} className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title" tabIndex={-1}>
        <h2 id="crop-title" className="crop-title">
          {t('studioCropTitle')}
        </h2>
        <canvas
          ref={canvas}
          className="crop-canvas"
          style={{ width: VIEW_WIDTH, aspectRatio: `${box.width} / ${box.height}` }}
          tabIndex={0}
          role="img"
          aria-label={`${t('studioCropHint')} (${ARROW_KEYS})`}
          data-ready={image !== null}
          onPointerDown={down}
          onPointerMove={moveDrag}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={arrows}
        />
        <p className="meta" aria-hidden="true">
          {t('studioCropHint')}
        </p>
        <label className="field">
          {t('studioCropZoom')}
          <input
            ref={zoom}
            type="range"
            min={CROP_SCALE.min}
            max={CROP_SCALE.max}
            step={0.05}
            value={crop.scale}
            onChange={(event) => setCrop((value) => zoomCrop(value, Number(event.target.value)))}
          />
        </label>
        <div className="toolbar crop-actions">
          <button type="button" className="btn btn-small" onClick={() => setCrop({ ...CROP_RESET })}>
            {t('studioCropReset')}
          </button>
          <button type="button" className="btn btn-small btn-primary" onClick={() => onDone(crop)}>
            {t('studioCropDone')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function dims(image: HTMLImageElement): { width: number; height: number } {
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}
