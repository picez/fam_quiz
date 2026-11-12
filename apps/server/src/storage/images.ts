import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AudioType = 'audio/mpeg' | 'audio/ogg' | 'audio/mp4';
export type MediaType = ImageType | AudioType;
export type StickerType = 'image/gif' | 'image/png';

export interface StoredImage {
  bytes: Uint8Array;
}

/** Сховище зображень і аудіо (назва лишилася від першого). Назву файлу вигадує сервер; сховище лише перевіряє її форму. */
export interface ImageStorage {
  put(name: string, bytes: Uint8Array, contentType: MediaType | StickerType): Promise<void>;
  /** Зображення або null, якщо такого немає. Збій сховища є винятком, а не null. */
  get(name: string): Promise<StoredImage | null>;
}

export const EXTENSIONS: Record<MediaType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
};

const IMAGE_NAME = /^[a-z0-9]{16,64}\.(jpg|png|webp)$/;
const MEDIA_NAME = /^[a-z0-9]{16,64}\.(jpg|png|webp|mp3|ogg|m4a)$/;
const STICKER_KEY = /^stickers\/[A-Za-z][A-Za-z0-9]{0,39}\.(gif|png)$/;
const AUDIO_NAME = /^[a-z0-9]{16,64}\.(mp3|ogg|m4a)$/;

/** Чи годиться назва зображення: лише така форма не може вказати за межі сховища. */
export const isImageName = (name: string) => IMAGE_NAME.test(name);

/** Назва файлу сховища: зображення або аудіо. */
export const isMediaName = (name: string) => MEDIA_NAME.test(name);

/** Ключ стікера у сховищі: stickers/<id>.<gif|png>. */
export const isStickerKey = (name: string) => STICKER_KEY.test(name);

const isStorable = (name: string) => isMediaName(name) || isStickerKey(name);

export const isAudioName = (name: string) => AUDIO_NAME.test(name);

function assertName(name: string) {
  if (!isStorable(name)) throw new Error('invalid media name');
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

/** Формат стікера за вмістом (GIF87a, GIF89a, PNG) або null. Окремо від sniffImage: завантаження GIF не відкриваємо. */
export function sniffSticker(bytes: Uint8Array): StickerType | null {
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  return null;
}

/** Основні марки контейнера MP4, з якими приходять аудіофайли m4a; HEIC, AVIF, QuickTime тощо не приймаються. */
const M4A_BRANDS = ['M4A ', 'M4B ', 'mp42', 'mp41', 'isom', 'iso2', 'dash'];

/**
 * Формат аудіо за вмістом або null: «ID3» чи кадр MPEG (11 бітів синхронізації, версія й шар не зарезервовані),
 * «OggS», «ftyp» з 4-го байта зі «звуковою» основною маркою (M4A_BRANDS). Заявленому клієнтом типу довіри немає.
 */
export function sniffAudio(bytes: Uint8Array): AudioType | null {
  if (startsWith(bytes, ascii('ID3'))) return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x18) !== 0x08 && (bytes[1]! & 0x06) !== 0) {
    return 'audio/mpeg';
  }
  if (startsWith(bytes, ascii('OggS'))) return 'audio/ogg';
  if (startsWith(bytes, ascii('ftyp'), 4) && M4A_BRANDS.some((brand) => startsWith(bytes, ascii(brand), 8))) return 'audio/mp4';
  return null;
}

/** Скільки байтів після тегів шукаємо синхрослово кадру (нулі чи сміття після тега). */
const MP3_SYNC_SEARCH = 64 * 1024;

/** Заголовок кадру MPEG: 11 бітів синхронізації, версія й шар не зарезервовані (ті самі перевірки, що в sniffAudio). */
const isMp3Frame = (bytes: Uint8Array, at: number) =>
  bytes[at] === 0xff && (bytes[at + 1]! & 0xe0) === 0xe0 && (bytes[at + 1]! & 0x18) !== 0x08 && (bytes[at + 1]! & 0x06) !== 0;

/**
 * MP3 без тегів (29e): прибирає ID3v2 на початку (повторювано; прапор footer додає ще 10 байтів), далі шукає синхрослово першого кадру
 * (до 64 КБ від кінця тега: нулі, сміття, не-synchsafe розмір старих тегів) і 128-байтний ID3v1 «TAG» у кінці, щоб назва й виконавець
 * не видавали відповідь у «Мелодії». Без тегів чи коли кадру не знайдено повертає той самий масив: файл, який приймав старий sniffAudio, не ламаємо.
 */
export function stripMp3Tags(bytes: Uint8Array): Uint8Array {
  let from = 0;
  let to = bytes.length;
  while (to - from >= 10 && startsWith(bytes.subarray(from), ascii('ID3'))) {
    const size = ((bytes[from + 6]! & 0x7f) << 21) | ((bytes[from + 7]! & 0x7f) << 14) | ((bytes[from + 8]! & 0x7f) << 7) | (bytes[from + 9]! & 0x7f);
    const footer = (bytes[from + 5]! & 0x10) !== 0 ? 10 : 0;
    from = Math.min(to, from + 10 + size + footer);
  }
  if (to - from >= 128 && startsWith(bytes.subarray(to - 128), ascii('TAG'))) to -= 128;
  if (from > 0) {
    const limit = Math.min(to - 1, from + MP3_SYNC_SEARCH);
    let at = from;
    while (at < limit && !isMp3Frame(bytes, at)) at += 1;
    if (at >= limit) return bytes;
    from = at;
  }
  return from === 0 && to === bytes.length ? bytes : bytes.subarray(from, to);
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
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), bytes);
    },
    async get(name) {
      if (!isStorable(name)) return null;
      try {
        return { bytes: await readFile(join(dir, name)) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}
