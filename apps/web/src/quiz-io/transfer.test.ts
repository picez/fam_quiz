import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({ uploadImage: vi.fn(), uploadAudio: vi.fn() }));

import { uploadAudio, uploadImage } from '../api';
import { fetchMedia, TransferError, UPLOAD_RETRIES, UPLOAD_RETRY_MS, uploadMedia, type TransferProgress } from './transfer';

const png = 'aaaaaaaaaaaaaaaa.png';
const mp3 = 'bbbbbbbbbbbbbbbb.mp3';
const ok = (url: string) => ({ ok: true as const, url });
const tooMany = { ok: false as const, error: 'too_many' };
const bytes = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  vi.mocked(uploadImage).mockReset();
  vi.mocked(uploadAudio).mockReset();
  vi.unstubAllGlobals();
});

describe('uploadMedia', () => {
  it('uploads images and audio through their routes', async () => {
    vi.mocked(uploadImage).mockResolvedValue(ok('/uploads/cccccccccccccccc.png'));
    vi.mocked(uploadAudio).mockResolvedValue(ok('/uploads/dddddddddddddddd.mp3'));
    const progress: TransferProgress[] = [];
    const map = await uploadMedia(
      new Map([
        [png, bytes],
        [mp3, bytes],
      ]),
      (p) => progress.push(p),
      async () => {},
    );
    expect(vi.mocked(uploadImage).mock.calls[0]![0].type).toBe('image/png');
    expect(vi.mocked(uploadAudio).mock.calls[0]![0].type).toBe('audio/mpeg');
    expect(map.get(`/uploads/${png}`)).toBe('/uploads/cccccccccccccccc.png');
    expect(map.get(`/uploads/${mp3}`)).toBe('/uploads/dddddddddddddddd.mp3');
    expect(progress).toContainEqual({ stage: 'media', done: 1, total: 2 });
    expect(progress[progress.length - 1]).toEqual({ stage: 'media', done: 2, total: 2 });
  });

  it('waits and retries on too_many', async () => {
    vi.mocked(uploadImage).mockResolvedValueOnce(tooMany).mockResolvedValueOnce(tooMany).mockResolvedValueOnce(ok('/uploads/cccccccccccccccc.png'));
    const wait = vi.fn(async () => {});
    const progress: TransferProgress[] = [];
    const map = await uploadMedia(new Map([[png, bytes]]), (p) => progress.push(p), wait);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(UPLOAD_RETRY_MS);
    expect(UPLOAD_RETRY_MS).toBe(15_000);
    expect(progress).toContainEqual({ stage: 'wait' });
    expect(map.size).toBe(1);
  });

  it('gives up after the retries', async () => {
    vi.mocked(uploadImage).mockResolvedValue(tooMany);
    const wait = vi.fn(async () => {});
    await expect(uploadMedia(new Map([[png, bytes]]), () => {}, wait)).rejects.toMatchObject({ code: 'too_many' });
    expect(UPLOAD_RETRIES).toBe(8);
    expect(uploadImage).toHaveBeenCalledTimes(9);
    expect(wait).toHaveBeenCalledTimes(8);
  });

  it('stops on another error', async () => {
    vi.mocked(uploadImage).mockResolvedValue({ ok: false, error: 'too_large' });
    const promise = uploadMedia(
      new Map([
        [png, bytes],
        [mp3, bytes],
      ]),
      () => {},
      async () => {},
    );
    await expect(promise).rejects.toBeInstanceOf(TransferError);
    await expect(promise).rejects.toMatchObject({ code: 'too_large' });
    expect(uploadAudio).not.toHaveBeenCalled();
  });

  it('refuses a foreign returned address', async () => {
    vi.mocked(uploadImage).mockResolvedValue(ok('https://evil/x.png'));
    await expect(uploadMedia(new Map([[png, bytes]]), () => {}, async () => {})).rejects.toMatchObject({ code: 'io_invalid' });
  });

  it('refuses an address of the wrong kind', async () => {
    vi.mocked(uploadImage).mockResolvedValue(ok('/uploads/cccccccccccccccc.mp3'));
    await expect(uploadMedia(new Map([[png, bytes]]), () => {}, async () => {})).rejects.toMatchObject({ code: 'io_invalid' });
  });

  it('waits with real timers through the default wait', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(uploadImage).mockResolvedValueOnce(tooMany).mockResolvedValueOnce(ok('/uploads/cccccccccccccccc.png'));
      const promise = uploadMedia(new Map([[png, bytes]]), () => {});
      await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_MS);
      expect((await promise).size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchMedia', () => {
  it('reads bytes and fails on 404', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('.png') ? new Response(new Uint8Array([9, 8]), { status: 200 }) : new Response('no', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const progress: TransferProgress[] = [];
    const map = await fetchMedia([`/uploads/${png}`], (p) => progress.push(p));
    expect([...map.get(png)!]).toEqual([9, 8]);
    expect(progress[progress.length - 1]).toEqual({ stage: 'media', done: 1, total: 1 });
    await expect(fetchMedia([`/uploads/${mp3}`], () => {})).rejects.toMatchObject({ code: 'io_media_fetch' });
  });

  it('fails when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(fetchMedia([`/uploads/${png}`], () => {})).rejects.toMatchObject({ code: 'io_media_fetch' });
  });
});
