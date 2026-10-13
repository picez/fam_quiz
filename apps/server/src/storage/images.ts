import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface StoredImage {
  bytes: Uint8Array;
}

/** Сховище зображень. Назву файлу вигадує сервер; сховище лише перевіряє її форму. */
export interface ImageStorage {
  put(name: string, bytes: Uint8Array, contentType: ImageType): Promise<void>;
  /** Зображення або null, якщо такого немає. Збій сховища є винятком, а не null. */
  get(name: string): Promise<StoredImage | null>;
}

export const EXTENSIONS: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const NAME = /^[a-z0-9]{16,64}\.(jpg|png|webp)$/;

/** Чи годиться назва: лише така форма не може вказати за межі сховища. */
export const isImageName = (name: string) => NAME.test(name);

function assertName(name: string) {
  if (!isImageName(name)) throw new Error('invalid image name');
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);

const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));

/** Формат зображення за його вмістом або null. Заявленому клієнтом типу довіри немає. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/** Сховище в пам'яті: для тестів. */
export function memoryStorage(): ImageStorage {
  const files = new Map<string, Uint8Array>();
  return {
    async put(name, bytes) {
      assertName(name);
      files.set(name, bytes);
    },
    async get(name) {
      const bytes = files.get(name);
      return bytes === undefined ? null : { bytes };
    },
  };
}

/** Сховище в теці на диску: для розробки й одного сервера з постійним диском. */
export function diskStorage(dir: string): ImageStorage {
  return {
    async put(name, bytes) {
      assertName(name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), bytes);
    },
    async get(name) {
      if (!isImageName(name)) return null;
      try {
        return { bytes: await readFile(join(dir, name)) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}
