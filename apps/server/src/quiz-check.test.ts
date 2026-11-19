import { DEFAULT_RULES, checkSeverity, type AdminQuizCheck, type QuizCheckCode } from '@quiz/shared';
import { describe, expect, it, vi } from 'vitest';
import { offlineFetch, quizChecker, type CheckFetch } from './quiz-check';
import { memoryStorage, type ImageStorage } from './storage/images';
import { PNG } from './testing/images';

const IMG = 'aaaaaaaaaaaaaaaa.png';
const MISSING = 'bbbbbbbbbbbbbbbb.png';
const oembed = (id: string) => `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&format=json`;
const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;

let n = 0;
const question = (over: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `q${n}`, type: 'text', text: `Запитання номер ${n}?`, imageUrl: null, video: null, timeLimit: 30, points: 1000, accepted: ['Відповідь'], ...over };
};
const quizWith = (questions: Record<string, unknown>[]) => ({
  title: 'Перевірка',
  description: '',
  settings: { leaderboard: 'each' },
  rounds: [{ id: 'r1', type: 'classic', title: '', speedBonus: true, shuffleOptions: false, rules: DEFAULT_RULES, questions }],
});

/** Підробка fetch: відповідь за адресою; невідома адреса — 599. */
const fakeFetch = (routes: Record<string, () => Response>) =>
  vi.fn<CheckFetch>(async (url) => {
    const route = routes[url];
    return route === undefined ? new Response(null, { status: 599 }) : route();
  });

const status = (code: number) => () => new Response(code === 200 ? 'ok' : null, { status: code });
const page = (body: string) => () => new Response(body, { status: 200 });

async function storageWithImage(): Promise<ImageStorage> {
  const storage = memoryStorage();
  await storage.put(IMG, PNG, 'image/png');
  return storage;
}

const at = new Date('2026-11-19T10:00:00.000Z');
const network = (check: AdminQuizCheck) =>
  check.issues.filter((i) => i.code.startsWith('media') || i.code.startsWith('video')).map((i) => [i.code, i.questionId, i.detail]);

describe('quizChecker', () => {
  it('storage: present is fine, absent is an error, a broken storage a warning', async () => {
    const present = question({ imageUrl: `/uploads/${IMG}` });
    const absent = question({ imageUrl: `/uploads/${MISSING}` });
    const raw = quizWith([present, absent]);
    const checker = quizChecker({ storage: await storageWithImage(), fetch: fakeFetch({}), now: () => at, timeoutMs: 50 });
    const result = await checker.check('quiz-1', at, raw);
    expect(network(result)).toEqual([['media_missing', absent.id, `/uploads/${MISSING}`]]);
    expect(result).toMatchObject({ quizId: 'quiz-1', checkedAt: at.toISOString(), errors: 1, warnings: 0 });

    const broken: ImageStorage = { put: async () => {}, get: async () => null, has: async () => Promise.reject(new Error('down')) };
    const brokenChecker = quizChecker({ storage: broken, fetch: fakeFetch({}), now: () => at, timeoutMs: 50 });
    expect(network(await brokenChecker.check('quiz-1', at, raw))).toEqual([
      ['media_unchecked', present.id, `/uploads/${IMG}`],
      ['media_unchecked', absent.id, `/uploads/${MISSING}`],
    ]);
  });

  it('a storage without has is asked with get', async () => {
    const plain = await storageWithImage();
    const storage: ImageStorage = { put: plain.put, get: plain.get };
    const absent = question({ imageUrl: `/uploads/${MISSING}` });
    const checker = quizChecker({ storage, fetch: fakeFetch({}), now: () => at, timeoutMs: 50 });
    expect(network(await checker.check('quiz-1', at, quizWith([question({ imageUrl: `/uploads/${IMG}` }), absent])))).toEqual([
      ['media_missing', absent.id, `/uploads/${MISSING}`],
    ]);
  });

  it('youtube via oEmbed', async () => {
    const ok = question({ video: { id: 'okokokokok1', start: 30 } });
    const closed = question({ video: { id: 'closedvide1', start: 0 } });
    const gone = question({ video: { id: 'gonegonego1', start: 0 } });
    const flaky = question({ video: { id: 'flakyflaky1', start: 0 } });
    const late = question({ video: { id: 'latelatela1', start: 90 } });
    const quiet = question({ video: { id: 'quietquiet1', start: 500 } });
    const fetch = fakeFetch({
      [oembed('okokokokok1')]: status(200),
      [watch('okokokokok1')]: page('..."lengthSeconds":"60",...'),
      [oembed('closedvide1')]: status(401),
      [oembed('gonegonego1')]: status(404),
      [oembed('flakyflaky1')]: status(500),
      [oembed('latelatela1')]: status(200),
      [watch('latelatela1')]: page('{"videoDetails":{"lengthSeconds":"60"}}'),
      [oembed('quietquiet1')]: status(200),
      [watch('quietquiet1')]: page('<html>no length here</html>'),
    });
    const checker = quizChecker({ storage: memoryStorage(), fetch, now: () => at, timeoutMs: 50 });
    const result = await checker.check('quiz-1', at, quizWith([ok, closed, gone, flaky, late, quiet]));
    expect(network(result)).toEqual([
      ['video_not_embeddable', closed.id, 'closedvide1'],
      ['video_missing', gone.id, 'gonegonego1'],
      ['video_start_past_end', late.id, '90/60'],
      ['video_unchecked', flaky.id, 'flakyflaky1'],
    ]);
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).toContain('https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dokokokokok1&format=json');
    // Сторінку з тривалістю читаємо лише після 200 від oEmbed.
    expect(urls).not.toContain(watch('closedvide1'));
    expect(urls).not.toContain(watch('flakyflaky1'));
    for (const [, init] of fetch.mock.calls) {
      expect(init.headers).toEqual({ 'user-agent': 'quiz-check/1.0' });
      expect(init.method).toBe('GET');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('external urls', async () => {
    const fine = question({ imageUrl: 'https://example.com/fine.jpg' });
    const lost = question({ imageUrl: 'https://example.com/lost.jpg' });
    const picky = question({ imageUrl: 'https://example.com/picky.jpg' });
    const fetch = vi.fn<CheckFetch>(async (url, init) => {
      if (url.endsWith('fine.jpg')) return new Response(null, { status: 200 });
      if (url.endsWith('lost.jpg')) return new Response(null, { status: 404 });
      return new Response(null, { status: init.method === 'HEAD' ? 405 : 200 });
    });
    const checker = quizChecker({ storage: memoryStorage(), fetch, now: () => at, timeoutMs: 50 });
    const result = await checker.check('quiz-1', at, quizWith([fine, lost, picky]));
    expect(network(result)).toEqual([['media_unreachable', lost.id, 'https://example.com/lost.jpg 404']]);
    expect(fetch.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'HEAD https://example.com/fine.jpg',
      'HEAD https://example.com/lost.jpg',
      'HEAD https://example.com/picky.jpg',
      'GET https://example.com/picky.jpg',
    ]);
  });

  it('a silent network ends in warnings within the timeout', async () => {
    const fetch = vi.fn<CheckFetch>(
      (_url, init) => new Promise<Response>((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    );
    const storage: ImageStorage = { put: async () => {}, get: async () => null, has: () => new Promise<boolean>(() => {}) };
    const picture = question({ imageUrl: `/uploads/${IMG}` });
    const clip = question({ video: { id: 'silentvide1', start: 0 } });
    const checker = quizChecker({ storage, fetch, now: () => at, timeoutMs: 50 });
    const started = Date.now();
    const result = await checker.check('quiz-1', at, quizWith([picture, clip]));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(network(result)).toEqual([
      ['media_unchecked', picture.id, `/uploads/${IMG}`],
      ['video_unchecked', clip.id, 'silentvide1'],
    ]);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(2);
  });

  it('a fetch that ignores the signal still ends within the timeout', async () => {
    const fetch = vi.fn<CheckFetch>(() => new Promise<Response>(() => {}));
    const checker = quizChecker({ storage: memoryStorage(), fetch, now: () => at, timeoutMs: 50 });
    const clip = question({ video: { id: 'deafdeafde1', start: 0 } });
    expect(network(await checker.check('quiz-1', at, quizWith([clip])))).toEqual([['video_unchecked', clip.id, 'deafdeafde1']]);
  });

  it('never more than 8 requests at once across checks', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch = vi.fn<CheckFetch>(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return new Response(null, { status: 200 });
    });
    const storage = await storageWithImage();
    const has = vi.spyOn(storage, 'has');
    const checker = quizChecker({ storage, fetch, now: () => at, timeoutMs: 1000 });
    const urls = (prefix: string) => Array.from({ length: 12 }, (_, i) => question({ imageUrl: `https://example.com/${prefix}${i}.jpg` }));
    const [first, second] = await Promise.all([checker.check('quiz-a', at, quizWith(urls('a'))), checker.check('quiz-b', at, quizWith(urls('b')))]);
    expect(fetch).toHaveBeenCalledTimes(24);
    expect(peak).toBe(8);
    expect(network(first)).toEqual([]);
    expect(network(second)).toEqual([]);

    const same = Array.from({ length: 30 }, () => question({ imageUrl: `/uploads/${IMG}` }));
    expect(network(await checker.check('quiz-c', at, quizWith(same)))).toEqual([]);
    expect(has).toHaveBeenCalledTimes(1);
  });

  it('caches for ten minutes per version', async () => {
    let clock = at;
    const fetch = fakeFetch({ [oembed('cachedvide1')]: status(200), [watch('cachedvide1')]: page('"lengthSeconds":"600"') });
    const checker = quizChecker({ storage: memoryStorage(), fetch, now: () => clock, timeoutMs: 50, ttlMs: 1000 });
    const raw = quizWith([question({ video: { id: 'cachedvide1', start: 0 } })]);
    const v1 = new Date('2026-11-19T09:00:00.000Z');
    const v2 = new Date('2026-11-19T09:30:00.000Z');
    expect(checker.last('quiz-1', v1)).toBeNull();
    const first = await checker.check('quiz-1', v1, raw);
    expect(fetch).toHaveBeenCalledTimes(2);
    clock = new Date(at.getTime() + 999);
    expect(await checker.check('quiz-1', v1, raw)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(2);
    clock = new Date(at.getTime() + 1000);
    const again = await checker.check('quiz-1', v1, raw);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(again.checkedAt).toBe(clock.toISOString());
    // Правка вікторини: значок зникає одразу, нова перевірка — нові запити.
    expect(checker.last('quiz-1', v2)).toBeNull();
    expect(checker.last('quiz-1', v1)).toBe(again);
    await checker.check('quiz-1', v2, raw);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(checker.last('quiz-1', v1)).toBeNull();
    clock = new Date(at.getTime() + 60_000);
    expect(checker.last('quiz-1', v2)).not.toBeNull();

    const fresh = fakeFetch({ [oembed('cachedvide1')]: status(200), [watch('cachedvide1')]: page('"lengthSeconds":"600"') });
    const twice = quizChecker({ storage: memoryStorage(), fetch: fresh, now: () => at, timeoutMs: 50 });
    const [a, b] = await Promise.all([twice.check('quiz-1', v1, raw), twice.check('quiz-1', v1, raw)]);
    expect(a).toBe(b);
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('a broken quiz is checked, not thrown', async () => {
    const raw = { title: 'Стара', rounds: [{ id: 'r1', type: 'classic', questions: [{ id: 'x1', type: 'single', text: 'Без варіантів?', correctId: 'a', imageUrl: 'https://example.com/x.jpg' }] }] };
    const checker = quizChecker({ storage: memoryStorage(), fetch: fakeFetch({ 'https://example.com/x.jpg': status(404) }), now: () => at, timeoutMs: 50 });
    const result = await checker.check('quiz-1', at, raw);
    const found = result.issues.map((i) => i.code);
    expect(found).toContain('schema');
    expect(found).toContain('no_correct');
    expect(network(result)).toEqual([['media_unreachable', 'x1', 'https://example.com/x.jpg 404']]);
    expect(result.errors).toBe(result.issues.length);
  });

  it('offlineFetch makes every network check a warning', async () => {
    await expect(offlineFetch('https://example.com', { method: 'GET', signal: AbortSignal.timeout(10), headers: {} })).rejects.toThrow('offline');
    const raw = quizWith([question({ imageUrl: 'https://example.com/a.jpg' }), question({ video: { id: 'offlinevid1', start: 0 } }), question({ imageUrl: `/uploads/${IMG}` })]);
    const checker = quizChecker({ storage: await storageWithImage(), fetch: offlineFetch, now: () => at, timeoutMs: 50 });
    const result = await checker.check('quiz-1', at, raw);
    expect(network(result).map(([code]) => code)).toEqual(['media_unchecked', 'video_unchecked']);
    const severities = result.issues.map((i) => checkSeverity(i.code as QuizCheckCode));
    expect(severities.lastIndexOf('error')).toBeLessThan(severities.indexOf('warning'));
    expect(result.warnings).toBe(severities.filter((s) => s === 'warning').length);
  });
});
