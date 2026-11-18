import { AUDIO_URL, IMAGE_URL } from '@quiz/shared';
import { uploadAudio, uploadImage } from '../api';
import { MEDIA_URL, mediaKind, mediaType } from './media';

export const UPLOAD_RETRY_MS = 15_000;
export const UPLOAD_RETRIES = 8;

export type TransferProgress = { stage: 'media'; done: number; total: number } | { stage: 'wait' };

export class TransferError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'TransferError';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOne(url: string): Promise<Uint8Array> {
  try {
    const response = await fetch(url);
    if (response.status !== 200) throw new TransferError('io_media_fetch');
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw error instanceof TransferError ? error : new TransferError('io_media_fetch');
  }
}

/** GET кожної адреси (same-origin); не 200 — TransferError('io_media_fetch'). Ключ — ім'я файлу. */
export async function fetchMedia(urls: string[], onProgress: (p: TransferProgress) => void): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  const total = urls.length;
  for (const url of urls) {
    const name = MEDIA_URL.exec(url)?.[1];
    if (name === undefined) throw new TransferError('io_media_fetch');
    result.set(name, await fetchOne(url));
    onProgress({ stage: 'media', done: result.size, total });
  }
  return result;
}

/** Послідовно, по одному разу на ім'я; too_many — чекає wait(UPLOAD_RETRY_MS) і повторює ≤ UPLOAD_RETRIES; повертає стара адреса → нова. */
export async function uploadMedia(
  media: ReadonlyMap<string, Uint8Array>,
  onProgress: (p: TransferProgress) => void,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const total = media.size;
  let done = 0;
  for (const [name, bytes] of media) {
    const kind = mediaKind(name);
    const send = kind === 'audio' ? uploadAudio : uploadImage;
    const pattern = kind === 'audio' ? AUDIO_URL : IMAGE_URL;
    onProgress({ stage: 'media', done, total });
    for (let attempt = 0; ; attempt++) {
      const answer = await send(new File([bytes as BlobPart], name, { type: mediaType(name) }));
      if (answer.ok) {
        if (!pattern.test(answer.url)) throw new TransferError('io_invalid');
        result.set(`/uploads/${name}`, answer.url);
        break;
      }
      if (answer.error !== 'too_many' || attempt >= UPLOAD_RETRIES) throw new TransferError(answer.error);
      onProgress({ stage: 'wait' });
      await wait(UPLOAD_RETRY_MS);
    }
    done += 1;
    onProgress({ stage: 'media', done, total });
  }
  return result;
}
