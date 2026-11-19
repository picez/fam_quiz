import { ADMIN_CACHE_MS, checkSeverity, mediaRefs, staticIssues, type AdminQuizCheck, type MediaRef, type QuizCheckCode, type QuizCheckIssue } from '@quiz/shared';
import { isMediaName, type ImageStorage } from './storage/images';

/** fetch перевірки (57): лише з параметра, щоб юніт-тести ніколи не ходили в мережу. */
export type CheckFetch = (url: string, init: { method: 'GET' | 'HEAD'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/** Типовий fetch без мережі: кожна мережева перевірка — попередження *_unchecked. */
export const offlineFetch: CheckFetch = () => Promise.reject(new Error('offline'));

export interface QuizCheckerDeps {
  storage: ImageStorage;
  fetch: CheckFetch;
  now: () => Date;
  /** Тайм-аут одного запиту (і storage.has), мс; типово 5000. */
  timeoutMs?: number;
  /** Скільки запитів одночасно на всі перевірки разом; типово 8. */
  concurrency?: number;
  /** Скільки живе готовий результат тієї самої версії, мс; типово ADMIN_CACHE_MS. */
  ttlMs?: number;
}

export interface QuizChecker {
  check(quizId: string, updatedAt: Date, raw: unknown): Promise<AdminQuizCheck>;
  /** Останній результат для значка; null — не перевіряли чи вікторину змінено після перевірки. Не старіє з ttl. */
  last(quizId: string, updatedAt: Date): AdminQuizCheck | null;
}

const HEADERS = { 'user-agent': 'quiz-check/1.0' };
const MAX_ENTRIES = 500;
const LENGTH = /"lengthSeconds":"(\d+)"/;

type StorageState = 'ok' | 'missing' | 'unchecked';
type UrlState = { state: 'ok' } | { state: 'unreachable'; status: number } | { state: 'unchecked' };
type VideoState = { state: 'ok'; length: number | null } | { state: 'not_embeddable' | 'missing' | 'unchecked' };

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const oembedUrl = (id: string) => `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`;

/** Тіло, яке не читаємо, відпускаємо, щоб не тримати з'єднання. */
const drop = (response: Response) => {
  void response.body?.cancel().catch(() => {});
};

/** Проміс, що не відповів за ms, стає винятком (сховище й fetch, які не слухають сигналу). */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

interface Entry {
  version: number;
  at: number;
  result: AdminQuizCheck;
}

/**
 * Перевірка вікторини адміном (57): чисті перевірки (staticIssues) і мережеві — файли сховища, зовнішні адреси, YouTube.
 * Один обмежувач на всі перевірки; кожен запит — з тайм-аутом; мовчазна мережа дає попередження, а не помилки й не виняток.
 */
export function quizChecker(deps: QuizCheckerDeps): QuizChecker {
  const timeoutMs = deps.timeoutMs ?? 5000;
  const concurrency = deps.concurrency ?? 8;
  const ttlMs = deps.ttlMs ?? ADMIN_CACHE_MS;
  const cache = new Map<string, Entry>();
  const running = new Map<string, Promise<AdminQuizCheck>>();

  // Обмежувач: вільне місце передається наступному в черзі напряму, тож у дорозі ніколи не більше concurrency.
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = (): Promise<void> => {
    if (active < concurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next === undefined) active -= 1;
    else next();
  };
  const limited = async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };

  /** Один запит з тайм-аутом; read — що взяти з відповіді (у межах того самого тайм-ауту). */
  const request = <T>(url: string, method: 'GET' | 'HEAD', read: (response: Response) => Promise<T>): Promise<T> =>
    limited(() => withTimeout(deps.fetch(url, { method, signal: AbortSignal.timeout(timeoutMs), headers: { ...HEADERS } }).then(read), timeoutMs));

  const storageState = async (name: string): Promise<StorageState> => {
    if (!isMediaName(name)) return 'missing';
    const { storage } = deps;
    try {
      const found = await limited(() => withTimeout(storage.has ? storage.has(name) : storage.get(name).then((file) => file !== null), timeoutMs));
      return found ? 'ok' : 'missing';
    } catch {
      return 'unchecked';
    }
  };

  const urlState = async (url: string): Promise<UrlState> => {
    const statusOf = (response: Response) => {
      drop(response);
      return Promise.resolve(response.status);
    };
    try {
      let status = await request(url, 'HEAD', statusOf);
      if (status === 405) status = await request(url, 'GET', statusOf);
      return status >= 200 && status < 300 ? { state: 'ok' } : { state: 'unreachable', status };
    } catch {
      return { state: 'unchecked' };
    }
  };

  const videoState = async (id: string): Promise<VideoState> => {
    let status: number;
    try {
      status = await request(oembedUrl(id), 'GET', (response) => {
        drop(response);
        return Promise.resolve(response.status);
      });
    } catch {
      return { state: 'unchecked' };
    }
    if (status === 401 || status === 403) return { state: 'not_embeddable' };
    if (status === 400 || status === 404) return { state: 'missing' };
    if (status !== 200) return { state: 'unchecked' };
    try {
      const body = await request(watchUrl(id), 'GET', async (response) => {
        if (!response.ok) {
          drop(response);
          return '';
        }
        return response.text();
      });
      const match = LENGTH.exec(body);
      return { state: 'ok', length: match === null ? null : Number(match[1]) };
    } catch {
      return { state: 'ok', length: null };
    }
  };

  /** Однакові ключі в межах запуску — один запит. */
  const once = <S>(keys: string[], probe: (key: string) => Promise<S>) => {
    const map = new Map<string, Promise<S>>();
    for (const key of keys) if (!map.has(key)) map.set(key, probe(key));
    return map;
  };

  const networkIssues = async (refs: MediaRef[]): Promise<QuizCheckIssue[]> => {
    const storages = once(refs.flatMap((r) => (r.kind === 'storage' ? [r.name] : [])), storageState);
    const urls = once(refs.flatMap((r) => (r.kind === 'url' ? [r.url] : [])), urlState);
    const videos = once(refs.flatMap((r) => (r.kind === 'youtube' ? [r.id] : [])), videoState);
    const issues: QuizCheckIssue[] = [];
    const seen = new Set<string>();
    const add = (ref: MediaRef, code: QuizCheckCode, detail: string) => {
      const key = JSON.stringify([code, ref.place.round, ref.place.questionId, detail]);
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ code, ...ref.place, detail });
    };
    for (const ref of refs) {
      if (ref.kind === 'storage') {
        const state = await storages.get(ref.name)!;
        if (state === 'missing') add(ref, 'media_missing', `/uploads/${ref.name}`);
        if (state === 'unchecked') add(ref, 'media_unchecked', `/uploads/${ref.name}`);
      } else if (ref.kind === 'url') {
        const result = await urls.get(ref.url)!;
        if (result.state === 'unreachable') add(ref, 'media_unreachable', `${ref.url} ${result.status}`);
        if (result.state === 'unchecked') add(ref, 'media_unchecked', ref.url);
      } else {
        const result = await videos.get(ref.id)!;
        if (result.state === 'not_embeddable') add(ref, 'video_not_embeddable', ref.id);
        if (result.state === 'missing') add(ref, 'video_missing', ref.id);
        if (result.state === 'unchecked') add(ref, 'video_unchecked', ref.id);
        if (result.state === 'ok' && result.length !== null && ref.start >= result.length) add(ref, 'video_start_past_end', `${ref.start}/${result.length}`);
      }
    }
    return issues;
  };

  const run = async (quizId: string, raw: unknown): Promise<AdminQuizCheck> => {
    const own = staticIssues(raw);
    const network = await networkIssues(mediaRefs(raw));
    const of = (list: QuizCheckIssue[], severity: 'error' | 'warning') => list.filter((i) => checkSeverity(i.code) === severity);
    const errors = [...of(own, 'error'), ...of(network, 'error')];
    const warnings = [...of(own, 'warning'), ...of(network, 'warning')];
    return { quizId, checkedAt: deps.now().toISOString(), errors: errors.length, warnings: warnings.length, issues: [...errors, ...warnings] };
  };

  const remember = (quizId: string, entry: Entry) => {
    cache.delete(quizId);
    cache.set(quizId, entry);
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  };

  return {
    check(quizId, updatedAt, raw) {
      const version = updatedAt.getTime();
      const hit = cache.get(quizId);
      if (hit !== undefined && hit.version === version && deps.now().getTime() - hit.at < ttlMs) return Promise.resolve(hit.result);
      const key = `${quizId}:${version}`;
      const inFlight = running.get(key);
      if (inFlight !== undefined) return inFlight;
      const work = run(quizId, raw)
        .then((result) => {
          remember(quizId, { version, at: deps.now().getTime(), result });
          return result;
        })
        .finally(() => running.delete(key));
      running.set(key, work);
      return work;
    },
    last(quizId, updatedAt) {
      const hit = cache.get(quizId);
      return hit !== undefined && hit.version === updatedAt.getTime() ? hit.result : null;
    },
  };
}
