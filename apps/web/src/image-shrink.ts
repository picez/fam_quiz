import { IMAGE_LIMITS } from '@quiz/shared';

/**
 * Зменшення фото в браузері перед завантаженням (32). Сервер перевіряє файл як і раніше (формат, до 2 МБ),
 * а браузер спершу зменшує його до maxSide і стискає у WebP. Так фото з телефона (3–6 МБ) взагалі можна
 * додати, і трафік легшає. Пропорції не змінюються, тож відносні координати (відмінності, пазл, пін-карти) цілі.
 */
export const IMAGE_MAX_SIDE = 1600;
export const AVATAR_MAX_SIDE = 512;
export const RAW_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const SKIP_BELOW_BYTES = 300 * 1024;

const WEBP_QUALITY = 0.82;
/** Скільки чекати, поки браузер прочитає розміри фото. */
const MEASURE_TIMEOUT_MS = 10_000;
const JPEG_QUALITY = 0.85;

interface Bitmap {
  width: number;
  height: number;
  close?(): void;
}

export interface ShrinkDeps {
  /** Розміри зображення (з урахуванням EXIF-орієнтації) без розкодування в повному розмірі; null — не вдалося прочитати. */
  measure(file: Blob): Promise<{ width: number; height: number } | null>;
  /** Розкодування одразу в розмір width×height. */
  decode(file: Blob, width: number, height: number): Promise<Bitmap | null>;
  encode(bitmap: unknown, width: number, height: number, type: string, quality: number): Promise<Blob | null>;
  hasAlpha(bitmap: unknown, width: number, height: number): boolean;
}

export type ShrinkResult = { ok: true; file: File } | { ok: false; error: 'bad_image' | 'too_large' | 'image_raw_too_large' };

/** Розмір у межах maxSide за довшою стороною, з тими самими пропорціями; цілі, не менше 1. */
export function targetSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

function renamed(name: string, type: string): string {
  const base = name.replace(/\.[^./]*$/, '') || 'image';
  return `${base}.${EXTENSIONS[type] ?? 'img'}`;
}

async function attempt(deps: ShrinkDeps, bitmap: Bitmap, width: number, height: number, type: string, quality: number): Promise<Blob | null> {
  try {
    return await deps.encode(bitmap, width, height, type, quality);
  } catch {
    return null;
  }
}

export async function shrinkImage(file: File, maxSide: number, deps: ShrinkDeps = browserShrinkDeps): Promise<ShrinkResult> {
  if (!(IMAGE_LIMITS.types as readonly string[]).includes(file.type)) return { ok: false, error: 'bad_image' };
  if (file.size > RAW_IMAGE_MAX_BYTES) return { ok: false, error: 'image_raw_too_large' };
  const fits = file.size <= IMAGE_LIMITS.maxBytes;
  const original = (error: 'bad_image' | 'too_large'): ShrinkResult => (fits ? { ok: true, file } : { ok: false, error });

  // Спершу лише розміри (без розкодування всього фото): 48-мегапіксельний знімок у повному розмірі — сотні МБ пам'яті.
  let size: { width: number; height: number } | null = null;
  try {
    size = await deps.measure(file);
  } catch {
    size = null;
  }
  // HEIC поза Safari чи битий файл: віддаємо як є, якщо сервер його прийме; інакше — що він завеликий.
  if (size === null || size.width < 1 || size.height < 1) return original('too_large');
  if (file.size <= SKIP_BELOW_BYTES && Math.max(size.width, size.height) <= maxSide) return { ok: true, file };
  const { width, height } = targetSize(size.width, size.height, maxSide);
  let bitmap: Bitmap | null = null;
  try {
    // Розкодування одразу в цільовий розмір (createImageBitmap з resizeWidth/resizeHeight).
    bitmap = await deps.decode(file, width, height);
  } catch {
    bitmap = null;
  }
  if (bitmap === null) return original('too_large');
  try {
    const transparent = file.type !== 'image/jpeg' && safeAlpha(deps, bitmap, width, height);

    let result: Blob | null = null;
    const webp = await attempt(deps, bitmap, width, height, 'image/webp', WEBP_QUALITY);
    if (webp?.type === 'image/webp') result = webp;
    else if (transparent) {
      // Без WebP прозорість тримає лише PNG (старий Safari і так віддав PNG замість WebP).
      const png = webp?.type === 'image/png' ? webp : await attempt(deps, bitmap, width, height, 'image/png', 1);
      if (png?.type === 'image/png') result = png;
    } else {
      const jpeg = await attempt(deps, bitmap, width, height, 'image/jpeg', JPEG_QUALITY);
      if (jpeg?.type === 'image/jpeg') result = jpeg;
    }

    if (result !== null && result.size <= IMAGE_LIMITS.maxBytes && (result.size < file.size || !fits)) {
      return { ok: true, file: new File([result], renamed(file.name, result.type), { type: result.type, lastModified: file.lastModified }) };
    }
    return original('too_large');
  } finally {
    try {
      bitmap.close?.();
    } catch {
      // Уже закритий.
    }
  }
}

function safeAlpha(deps: ShrinkDeps, bitmap: Bitmap, width: number, height: number): boolean {
  try {
    return deps.hasAlpha(bitmap, width, height);
  } catch {
    // Не знаємо: безпечніше вважати, що прозорість є (JPEG залив би її чорним).
    return true;
  }
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function canvasOf(width: number, height: number): { context: Canvas2D | null; toBlob(type: string, quality: number): Promise<Blob | null> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return { context: canvas.getContext('2d'), toBlob: (type, quality) => canvas.convertToBlob({ type, quality }) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { context: canvas.getContext('2d'), toBlob: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)) };
}

/** Справжній браузер: createImageBitmap (орієнтацію з EXIF враховує сам) і canvas. Будь-яка помилка дає null. */
export const browserShrinkDeps: ShrinkDeps = {
  measure(file) {
    if (typeof createImageBitmap !== 'function' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
    // <img> читає розміри із заголовка файла (з EXIF-орієнтацією) і не тримає повний розкодований кадр.
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      const done = (value: { width: number; height: number } | null) => {
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        image.src = '';
        URL.revokeObjectURL(url);
        resolve(value);
      };
      const timer = window.setTimeout(() => done(null), MEASURE_TIMEOUT_MS);
      image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
      image.onerror = () => done(null);
      image.src = url;
    });
  },
  async decode(file, width, height) {
    if (typeof createImageBitmap !== 'function') return null;
    try {
      return await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    } catch {
      return null;
    }
  },
  async encode(bitmap, width, height, type, quality) {
    try {
      const { context, toBlob } = canvasOf(width, height);
      if (context === null) return null;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
      return await toBlob(type, quality);
    } catch {
      return null;
    }
  },
  hasAlpha(bitmap) {
    const { context } = canvasOf(32, 32);
    if (context === null) return true;
    context.drawImage(bitmap as CanvasImageSource, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32);
    for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
    return false;
  },
};
