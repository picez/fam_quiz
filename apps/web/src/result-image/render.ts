import { canvasPng } from '../share-image';
import type { ResultImageData } from './data';
import { RESULT_SIZE, resultLayout } from './layout';

/** Малює картинку підсумку (38c) на canvas 1080×1350 і віддає PNG; вигляд не залежить від теми додатку. */
export async function renderResultImage(data: ResultImageData): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = RESULT_SIZE.width;
  canvas.height = RESULT_SIZE.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  const rtl = document.dir === 'rtl';
  context.direction = rtl ? 'rtl' : 'ltr';
  context.textBaseline = 'alphabetic';
  const measure = (font: string, text: string): number => {
    context.font = font;
    return context.measureText(text).width;
  };
  for (const op of resultLayout(data, measure, rtl)) {
    if (op.kind === 'rect') {
      context.fillStyle = op.fill;
      context.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.kind === 'frame') {
      context.strokeStyle = op.stroke;
      context.lineWidth = op.line;
      context.strokeRect(op.x, op.y, op.w, op.h);
    } else {
      context.font = op.font;
      context.fillStyle = op.fill;
      context.textAlign = op.align;
      context.fillText(op.text, op.x, op.y);
    }
  }
  return canvasPng(canvas);
}
