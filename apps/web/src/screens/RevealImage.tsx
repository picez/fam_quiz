import { useEffect, useRef, useState } from 'react';
import type { RevealMode } from '@quiz/shared';
import { blurRadius, pixelColumns, REVEAL_STAGES } from '../reveal';
import { QuestionImage } from './QuestionImage';

const MAX_SIDE = 1200;

interface Props {
  url: string | null;
  mode: RevealMode | null;
  /** 0…10; на 10 — оригінал. */
  stage: number;
  alt?: string;
}

/** Завантажена картинка для canvas; null, поки вантажиться. */
function useLoadedImage(url: string, onFail: () => void): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  // Стабільне посилання: інакше нова стрілка щоразу перезавантажувала б картинку.
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => fail.current();
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);
  return image;
}

/** Розмір canvas: як у картинки, але не більше MAX_SIDE по довгій стороні (великий canvas на телефоні — зайва пам'ять). */
function canvasSize(image: HTMLImageElement, fallback: number): { width: number; height: number } {
  const shrink = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1));
  return { width: Math.round((image.naturalWidth || fallback) * shrink), height: Math.round((image.naturalHeight || fallback) * shrink) };
}

/** Пікселі: картинка стискається в невидимий canvas із pixelColumns стовпців і розтягується без згладжування. */
function PixelCanvas({ url, stage, alt, onFail }: { url: string; stage: number; alt: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useLoadedImage(url, onFail);

  useEffect(() => {
    const target = canvas.current;
    const columns = pixelColumns(stage);
    if (target === null || image === null || columns === null) return;
    const { width, height } = canvasSize(image, columns);
    const rows = Math.max(1, Math.round((columns * height) / width));
    const small = document.createElement('canvas');
    small.width = columns;
    small.height = rows;
    small.getContext('2d')?.drawImage(image, 0, 0, columns, rows);
    target.width = width;
    target.height = height;
    const ctx = target.getContext('2d');
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, columns, rows, 0, 0, width, height);
  }, [image, stage]);

  return <canvas ref={canvas} className="question-image reveal-canvas" data-stage={stage} role="img" aria-label={alt} />;
}

/**
 * Розмиття малюється на canvas (ctx.filter): у сторінці немає чіткого <img>, який можна зберегти довгим дотиком.
 * Без ctx.filter (старий Safari) canvas малюється чітким, а розмиває його CSS — як запасний шлях.
 */
function BlurCanvas({ url, stage, alt, onFail }: { url: string; stage: number; alt: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useLoadedImage(url, onFail);
  const [cssBlur, setCssBlur] = useState<number | null>(null);

  useEffect(() => {
    const target = canvas.current;
    if (target === null || image === null) return;
    const { width, height } = canvasSize(image, 1);
    target.width = width;
    target.height = height;
    const ctx = target.getContext('2d');
    if (ctx === null) return;
    // Радіус задано в пікселях екрана; canvas показується в масштабі object-fit: contain.
    const shown = Math.min(target.clientWidth / width, target.clientHeight / height);
    const radius = blurRadius(stage) / (Number.isFinite(shown) && shown > 0 ? shown : 1);
    const supported = typeof ctx.filter === 'string';
    if (supported) ctx.filter = `blur(${radius}px)`;
    // Картинка трохи ширша за canvas: краї розмиття не прозорі.
    const pad = supported ? radius * 2 : 0;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, -pad, -pad, width + pad * 2, height + pad * 2);
    if (supported) ctx.filter = 'none';
    setCssBlur(supported ? null : blurRadius(stage));
  }, [image, stage]);

  return (
    <div className="reveal-frame">
      <canvas
        ref={canvas}
        className="question-image reveal-blur"
        data-stage={stage}
        role="img"
        aria-label={alt}
        style={cssBlur === null ? undefined : { filter: `blur(${cssBlur}px)` }}
      />
    </div>
  );
}

/** Картинка запитання з режимом проявлення; mode null — звичайна QuestionImage. */
export function RevealImage({ url, mode, stage, alt = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  if (url === null || failed === url) return null;
  if (mode === null) return <QuestionImage url={url} alt={alt} />;
  if (stage >= REVEAL_STAGES) return <img className="question-image" src={url} alt={alt} data-stage={stage} onError={() => setFailed(url)} />;
  if (mode === 'pixels') return <PixelCanvas url={url} stage={stage} alt={alt} onFail={() => setFailed(url)} />;
  return <BlurCanvas url={url} stage={stage} alt={alt} onFail={() => setFailed(url)} />;
}
