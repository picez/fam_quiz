import { ADMIN_CACHE_MS, checkSeverity, mediaRefs, staticIssues, type AdminQuizCheck, type MediaRef, type QuizCheckCode, type QuizCheckIssue } from '@quiz/shared';
import { isMediaName, type ImageStorage } from './storage/images';
import { guardTarget, offlineResolve, type CheckResolve } from './url-guard';

/** fetch перевірки (57): лише з параметра, щоб юніт-тести ніколи не ходили в мережу. Переходи (3xx) перевірка робить сама. */
export type CheckFetch = (url: string, init: { method: 'GET' | 'HEAD'; signal: AbortSignal; headers: Record<string, string>; redirect: 'manual' }) => Promise<Response>;

/** Типовий fetch без мережі: кожна мережева перевірка — попередження *_unchecked. */
export const offlineFetch: CheckFetch = () => Promise.reject(new Error('offline'));

export interface QuizCheckerDeps {
  storage: ImageStorage;
  fetch: CheckFetch;
  now: () => Date;
  /** Адреси імені хоста для захисту від запитів у внутрішню мережу; типово offlineResolve (зовнішні адреси неперевірені). */
  resolve?: CheckResolve;
  /** Тайм-аут одного запиту (і storage.has), мс; типово 5000. */
  timeoutMs?: number;
  /** Скільки запитів одночасно на всі перевірки разом; типово 8. */
  concurrency?: number;
  /** Скільки живе готовий результат тієї самої версії, мс; типово ADMIN_CACHE_MS. */
  ttlMs?: number;
  /** Бюджет одного запуску, мс; що не встигло — *_unchecked. Типово 30 000. */
  budgetMs?: number;
  /** Скільки різних посилань (файлів, адрес, відео) перевіряти за запуск; решта — *_unchecked. Типово 200. */
  maxRefs?: number;
}

export interface QuizChecker {
  /** bot — вікторина бота (її грає автопілот): лише тоді раунд, що потребує ведучого, — помилка. */
  check(quizId: string, updatedAt: Date, raw: unknown, options?: { bot?: boolean }): Promise<AdminQuizCheck>;
  /** Останній результат для значка; null — не перевіряли, вікторину змінено після перевірки чи минула доба. Не старіє з ttl. */
  last(quizId: string, updatedAt: Date): AdminQuizCheck | null;
}

const HEADERS = { 'user-agent': 'quiz-check/1.0' };
const MAX_ENTRIES = 500;
const LAST_MS = 24 * 3_600_000;
const MAX_HOPS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const LENGTH = /"lengthSeconds":"(\d+)"/;
/** Сталі адреси YouTube перевірки (id — за YOUTUBE_ID): DNS для них не питаємо. */
const TRUSTED = /^https:\/\/(?:[a-z0-9-]+\.)*youtube\.com\//;

type StorageState = 'ok' | 'missing' | 'unchecked';
type UrlState = { state: 'ok' } | { state: 'unreachable'; status: number } | { state: 'unchecked' | 'blocked' };
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

/** Ціль (чи її перехід) — внутрішня адреса: запиту немає. */
class Blocked extends Error {}

interface Entry {
  version: number;
  at: number;
  result: AdminQuizCheck;
}

/** Один запуск: спільний кінцевий строк (за справжнім годинником) і сигнал, що спрацьовує на ньому. */
interface Run {
  deadline: number;
  signal: AbortSignal;
}

/**
 * Перевірка вікторини адміном (57): чисті перевірки (staticIssues) і мережеві — файли сховища, зовнішні адреси, YouTube.
 * Один обмежувач на всі перевірки; кожен запит — з тайм-аутом, запуск — з бюджетом; внутрішні адреси не запитуються;
 * мовчазна мережа дає попередження, а не помилки й не виняток.
 */
export function quizChecker(deps: QuizCheckerDeps): QuizChecker {
  const timeoutMs = deps.timeoutMs ?? 5000;
  const concurrency = deps.concurrency ?? 8;
  const ttlMs = deps.ttlMs ?? ADMIN_CACHE_MS;
  const budgetMs = deps.budgetMs ?? 30_000;
  const maxRefs = deps.maxRefs ?? 200;
  const resolve = deps.resolve ?? offlineResolve;
  const cache = new Map<string, Entry>();
  const running = new Map<string, Promise<AdminQuizCheck>>();

  // Обмежувач: вільне місце передається наступному в черзі напряму, тож у дорозі ніколи не більше concurrency.
  // Хто чекає в черзі, коли бюджет його запуску скінчився, виходить із неї без запиту.
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return Promise.reject(new Error('budget'));
    if (active < concurrency) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = waiting.indexOf(waiter);
        if (index !== -1) waiting.splice(index, 1);
        reject(new Error('budget'));
      };
      const waiter = () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      waiting.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  };
  const release = () => {
    const next = waiting.shift();
    if (next === undefined) active -= 1;
    else next();
  };

  /** Скільки ще можна чекати один крок: не більше тайм-ауту й не довше бюджету. */
  const allowance = (run: Run) => {
    const ms = Math.min(timeoutMs, run.deadline - Date.now());
    if (ms <= 0 || run.signal.aborted) throw new Error('budget');
    return ms;
  };

  const limited = async <T>(run: Run, task: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    await acquire(run.signal);
    try {
      const ms = allowance(run);
      return await withTimeout(task(AbortSignal.any([AbortSignal.timeout(ms), run.signal])), ms);
    } finally {
      release();
    }
  };

  /**
   * Запит із захистом: кожна ціль (і кожен перехід, не більше MAX_HOPS) — лише публічна адреса; переходи — вручну (303 — GET).
   * read — що взяти з остаточної відповіді (у межах того самого тайм-ауту). Внутрішня ціль — Blocked, без запиту до неї.
   */
  const request = async <T>(run: Run, url: string, method: 'GET' | 'HEAD', read: (response: Response) => Promise<T>): Promise<T> => {
    let target = url;
    let verb = method;
    for (let hop = 0; ; hop += 1) {
      if (!TRUSTED.test(target) && (await withTimeout(guardTarget(target, resolve), allowance(run))) === 'blocked') throw new Blocked();
      const step = await limited(run, async (signal): Promise<{ kind: 'done'; value: T } | { kind: 'redirect'; location: string; status: number }> => {
        const response = await deps.fetch(target, { method: verb, signal, headers: { ...HEADERS }, redirect: 'manual' });
        const location = REDIRECTS.has(response.status) ? response.headers.get('location') : null;
        if (location !== null) {
          drop(response);
          return { kind: 'redirect', location, status: response.status };
        }
        return { kind: 'done', value: await read(response) };
      });
      if (step.kind === 'done') return step.value;
      if (hop >= MAX_HOPS) throw new Error('too many redirects');
      target = new URL(step.location, target).href;
      if (step.status === 303) verb = 'GET';
    }
  };

  const statusOf = (response: Response) => {
    drop(response);
    return Promise.resolve(response.status);
  };

  const storageState = async (run: Run, name: string): Promise<StorageState> => {
    if (!isMediaName(name)) return 'missing';
    const { storage } = deps;
    try {
      const found = await limited(run, (signal) => (storage.has ? storage.has(name, signal) : storage.get(name).then((file) => file !== null)));
      return found ? 'ok' : 'missing';
    } catch {
      return 'unchecked';
    }
  };

  const urlState = async (run: Run, url: string): Promise<UrlState> => {
    try {
      let status = await request(run, url, 'HEAD', statusOf);
      if (status === 405) status = await request(run, url, 'GET', statusOf);
      return status >= 200 && status < 300 ? { state: 'ok' } : { state: 'unreachable', status };
    } catch (error) {
      return { state: error instanceof Blocked ? 'blocked' : 'unchecked' };
    }
  };

  const videoState = async (run: Run, id: string): Promise<VideoState> => {
    let status: number;
    try {
      status = await request(run, oembedUrl(id), 'GET', statusOf);
    } catch {
      return { state: 'unchecked' };
    }
    if (status === 401 || status === 403) return { state: 'not_embeddable' };
    if (status === 400 || status === 404) return { state: 'missing' };
    if (status !== 200) return { state: 'unchecked' };
    try {
      const body = await request(run, watchUrl(id), 'GET', async (response) => {
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

  const networkIssues = async (run: Run, refs: MediaRef[]): Promise<QuizCheckIssue[]> => {
    // Однакові ключі в межах запуску — один запит; різних — не більше maxRefs, решта неперевірені.
    const keyOf = (ref: MediaRef) => (ref.kind === 'storage' ? `s:${ref.name}` : ref.kind === 'url' ? `u:${ref.url}` : `y:${ref.id}`);
    const probes = new Map<string, Promise<StorageState | UrlState | VideoState>>();
    for (const ref of refs) {
      const key = keyOf(ref);
      if (probes.has(key)) continue;
      const capped = probes.size >= maxRefs;
      probes.set(
        key,
        ref.kind === 'storage'
          ? capped ? Promise.resolve('unchecked') : storageState(run, ref.name)
          : ref.kind === 'url'
            ? capped ? Promise.resolve({ state: 'unchecked' }) : urlState(run, ref.url)
            : capped ? Promise.resolve({ state: 'unchecked' }) : videoState(run, ref.id),
      );
    }
    const issues: QuizCheckIssue[] = [];
    const seen = new Set<string>();
    const add = (ref: MediaRef, code: QuizCheckCode, detail: string) => {
      const key = JSON.stringify([code, ref.place.round, ref.place.questionId, detail]);
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ code, ...ref.place, detail });
    };
    for (const ref of refs) {
      const outcome = await probes.get(keyOf(ref))!;
      if (ref.kind === 'storage') {
        const state = outcome as StorageState;
        if (state === 'missing') add(ref, 'media_missing', `/uploads/${ref.name}`);
        if (state === 'unchecked') add(ref, 'media_unchecked', `/uploads/${ref.name}`);
      } else if (ref.kind === 'url') {
        const result = outcome as UrlState;
        if (result.state === 'unreachable') add(ref, 'media_unreachable', `${ref.url} ${result.status}`);
        if (result.state === 'unchecked') add(ref, 'media_unchecked', ref.url);
        if (result.state === 'blocked') add(ref, 'media_blocked', ref.url);
      } else {
        const result = outcome as VideoState;
        if (result.state === 'not_embeddable') add(ref, 'video_not_embeddable', ref.id);
        if (result.state === 'missing') add(ref, 'video_missing', ref.id);
        if (result.state === 'unchecked') add(ref, 'video_unchecked', ref.id);
        if (result.state === 'ok' && result.length !== null && ref.start >= result.length) add(ref, 'video_start_past_end', `${ref.start}/${result.length}`);
      }
    }
    return issues;
  };

  const runCheck = async (quizId: string, raw: unknown, bot: boolean): Promise<AdminQuizCheck> => {
    const own = staticIssues(raw, { bot });
    const budget = new AbortController();
    const timer = setTimeout(() => budget.abort(), budgetMs);
    let network: QuizCheckIssue[];
    try {
      network = await networkIssues({ deadline: Date.now() + budgetMs, signal: budget.signal }, mediaRefs(raw));
    } finally {
      clearTimeout(timer);
      budget.abort();
    }
    const of = (list: QuizCheckIssue[], severity: 'error' | 'warning') => list.filter((i) => checkSeverity(i.code) === severity);
    const errors = [...of(own, 'error'), ...of(network, 'error')];
    const warnings = [...of(own, 'warning'), ...of(network, 'warning')];
    return { quizId, checkedAt: deps.now().toISOString(), errors: errors.length, warnings: warnings.length, issues: [...errors, ...warnings] };
  };

  const remember = (quizId: string, entry: Entry) => {
    // Запуск старішої версії, що скінчився пізно, не затирає новішу.
    const current = cache.get(quizId);
    if (current !== undefined && current.version > entry.version) return;
    cache.delete(quizId);
    cache.set(quizId, entry);
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  };

  return {
    check(quizId, updatedAt, raw, options = {}) {
      const version = updatedAt.getTime();
      const hit = cache.get(quizId);
      if (hit !== undefined && hit.version === version && deps.now().getTime() - hit.at < ttlMs) return Promise.resolve(hit.result);
      const key = `${quizId}:${version}`;
      const inFlight = running.get(key);
      if (inFlight !== undefined) return inFlight;
      const work = runCheck(quizId, raw, options.bot === true)
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
      return hit !== undefined && hit.version === updatedAt.getTime() && deps.now().getTime() - hit.at < LAST_MS ? hit.result : null;
    },
  };
}
