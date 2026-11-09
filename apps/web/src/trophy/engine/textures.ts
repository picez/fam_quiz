import { stickerOf, stickerPath } from '@quiz/shared';
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

/** Картинка, яку можна намалювати на 2D-полотні. */
export type Img = CanvasImageSource & { width: number; height: number };

/** Усе, що потребує DOM-полотна й картинок; у тестах підмінюється. */
export interface DecorTextures {
  /** Кеш за url (не більше IMAGE_CACHE_MAX готових); збій (404, офлайн) → null. */
  image(url: string): Promise<Img | null>;
  /**
   * Полотно width×height, намальоване draw, як CanvasTexture у SRGB. Та сама key → та сама Texture
   * (draw не викликається вдруге); кожен виклик — +1 посилання, яке звільняє release.
   */
  canvas(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture;
  /** −1 посилання; останнє — texture.dispose(). Невідома текстура (не з canvas) — dispose одразу. */
  release(texture: Texture): void;
  /** Перший кадр наліпки; невідома чи не завантажилась → null. Текстура спільна (кеш): не звільняти. */
  sticker(id: string): Promise<Texture | null>;
}

/** Скільки готових картинок тримає кеш: вітрина з 60 призів по 16 фото не тримає всі назавжди. */
export const IMAGE_CACHE_MAX = 48;

/** Порядок Map — від найдавніше використаної до останньої. */
const images = new Map<string, Promise<Img | null>>();
/** Url, чия картинка вже завантажилась: витісняються лише такі, ті, що ще вантажаться, лишаються. */
const loadedImages = new Set<string>();
const stickers = new Map<string, Promise<Texture | null>>();
const canvases = new Map<string, { texture: Texture; refs: number }>();
const canvasKeys = new WeakMap<Texture, string>();

/** Скільки записів зараз у кеші картинок (для тестів). */
export function imageCacheSize(): number {
  return images.size;
}

/** Скільки чекаємо картинку: запит, що завис, не повинен лишати трофей значком назавжди. */
export const IMAGE_LOAD_TIMEOUT_MS = 8000;

function loadImage(url: string): Promise<Img | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), IMAGE_LOAD_TIMEOUT_MS);
    image.decoding = 'async';
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context !== null) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Понад межу — геть найдавніше використані готові картинки. */
function trimImages(): void {
  for (const url of images.keys()) {
    if (images.size <= IMAGE_CACHE_MAX) return;
    if (!loadedImages.has(url)) continue;
    images.delete(url);
    loadedImages.delete(url);
  }
}

export const domTextures: DecorTextures = {
  image(url) {
    const cached = images.get(url);
    if (cached !== undefined) {
      // Використали — у кінець черги витіснення.
      images.delete(url);
      images.set(url, cached);
      return cached;
    }
    const loading = loadImage(url);
    images.set(url, loading);
    void loading.then((loaded) => {
      if (images.get(url) !== loading) return;
      // Збій не кешується: наступний трофей спробує знову.
      if (loaded === null) images.delete(url);
      else {
        loadedImages.add(url);
        trimImages();
      }
    });
    trimImages();
    return loading;
  },
  canvas(key, width, height, draw) {
    const shared = canvases.get(key);
    if (shared !== undefined) {
      shared.refs += 1;
      return shared.texture;
    }
    const texture = canvasTexture(width, height, draw);
    canvases.set(key, { texture, refs: 1 });
    canvasKeys.set(texture, key);
    return texture;
  },
  release(texture) {
    const key = canvasKeys.get(texture);
    const shared = key === undefined ? undefined : canvases.get(key);
    if (key === undefined || shared === undefined || shared.texture !== texture) {
      texture.dispose();
      return;
    }
    shared.refs -= 1;
    if (shared.refs > 0) return;
    canvases.delete(key);
    canvasKeys.delete(texture);
    texture.dispose();
  },
  sticker(id) {
    let texture = stickers.get(id);
    if (texture === undefined) {
      const sticker = stickerOf(id);
      if (sticker === undefined) return Promise.resolve(null);
      texture = loadImage(stickerPath(sticker)).then((image) =>
        image === null
          ? null
          : canvasTexture(image.width, image.height, (ctx) => ctx.drawImage(image, 0, 0)),
      );
      stickers.set(id, texture);
      void texture.then((loaded) => {
        if (loaded === null && stickers.get(id) === texture) stickers.delete(id);
      });
    }
    return texture;
  },
};
