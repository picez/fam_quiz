import { stickerOf, stickerPath } from '@quiz/shared';
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

/** Картинка, яку можна намалювати на 2D-полотні. */
export type Img = CanvasImageSource & { width: number; height: number };

/** Усе, що потребує DOM-полотна й картинок; у тестах підмінюється. */
export interface DecorTextures {
  /** Кеш за url; збій (404, офлайн) → null. */
  image(url: string): Promise<Img | null>;
  /** Нове полотно width×height, намальоване draw, як CanvasTexture у SRGB. */
  canvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture;
  /** Перший кадр наліпки; невідома чи не завантажилась → null. Текстура спільна (кеш): не звільняти. */
  sticker(id: string): Promise<Texture | null>;
}

const images = new Map<string, Promise<Img | null>>();
const stickers = new Map<string, Promise<Texture | null>>();

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

export const domTextures: DecorTextures = {
  image(url) {
    let image = images.get(url);
    if (image === undefined) {
      image = loadImage(url);
      images.set(url, image);
      // Збій не кешується: наступний трофей спробує знову.
      void image.then((loaded) => {
        if (loaded === null && images.get(url) === image) images.delete(url);
      });
    }
    return image;
  },
  canvas: canvasTexture,
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
