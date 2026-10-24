import { useEffect, useRef, useState } from 'react';
import type { RevealMode } from '@quiz/shared';
import { blurRadius, pixelColumns, REVEAL_STAGES } from '../reveal';
import { QuestionImage } from './QuestionImage';

interface Props {
  url: string | null;
  mode: RevealMode | null;
  /** 0…10; на 10 — оригінал. */
  stage: number;
  alt?: string;
}

/** Пікселі: картинка стискається в невидимий canvas із pixelColumns стовпців і розтягується без згладжування. */
function PixelCanvas({ url, stage, alt, onFail }: { url: string; stage: number; alt: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const target = canvas.current;
    const columns = pixelColumns(stage);
    if (target === null || image === null || columns === null) return;
    const width = image.naturalWidth || columns;
    const height = image.naturalHeight || columns;
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

/** Картинка запитання з режимом проявлення; mode null — звичайна QuestionImage. */
export function RevealImage({ url, mode, stage, alt = '' }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  if (url === null || failed === url) return null;
  if (mode === null) return <QuestionImage url={url} alt={alt} />;
  if (stage >= REVEAL_STAGES) return <img className="question-image" src={url} alt={alt} data-stage={stage} onError={() => setFailed(url)} />;
  if (mode === 'pixels') return <PixelCanvas url={url} stage={stage} alt={alt} onFail={() => setFailed(url)} />;
  return (
    <div className="reveal-frame">
      <img
        className="question-image"
        src={url}
        alt={alt}
        data-stage={stage}
        style={{ filter: `blur(${blurRadius(stage)}px)` }}
        onError={() => setFailed(url)}
      />
    </div>
  );
}
