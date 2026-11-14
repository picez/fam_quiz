import { describe, expect, it, vi } from 'vitest';
import plPush from '../push/strings/pl.json';
import {
  cacheNames,
  dropOldCaches,
  handleAsset,
  handleNavigate,
  localeFromHeader,
  NAV_TIMEOUT_MS,
  offlinePage,
  precacheShell,
  routeOf,
  type CacheDeps,
  type CacheLike,
} from './shell-cache';

const ORIGIN = 'https://quiz.test';
const V = 'v1';

function fakeCaches(): CacheDeps['caches'] & { store: Map<string, Map<string, Response>> } {
  const store = new Map<string, Map<string, Response>>();
  const open = async (name: string): Promise<CacheLike> => {
    let entries = store.get(name);
    if (entries === undefined) {
      entries = new Map();
      store.set(name, entries);
    }
    const bucket = entries;
    return {
      match: async (key) => bucket.get(key)?.clone(),
      put: async (key, response) => {
        // Як справжній Cache: тіло читається до кінця.
        const body = await response.arrayBuffer();
        bucket.set(key, new Response(body, { status: response.status, headers: response.headers }));
      },
    };
  };
  return {
    store,
    open,
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
  };
}

const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init, headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) } });
const js = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init, headers: { 'content-type': 'text/javascript', ...(init.headers ?? {}) } });

function deps(fetchImpl: CacheDeps['fetch'], caches = fakeCaches()) {
  const timers: { fn: () => void; ms: number }[] = [];
  const d: CacheDeps = { caches, fetch: vi.fn(fetchImpl), setTimeout: (fn, ms) => timers.push({ fn, ms }) };
  return { d, caches, fireTimers: () => timers.splice(0).forEach((timer) => timer.fn()), timers };
}

const req = (path: string, init: { method?: string; mode?: string; headers?: Record<string, string>; origin?: string } = {}) => ({
  method: init.method ?? 'GET',
  url: (init.origin ?? ORIGIN) + path,
  mode: init.mode ?? 'cors',
  headers: new Headers(init.headers ?? {}),
});

const navRequest = (path: string, acceptLanguage?: string) =>
  new Request(ORIGIN + path, { headers: acceptLanguage === undefined ? {} : { 'accept-language': acceptLanguage } });

async function seedShell(caches: ReturnType<typeof fakeCaches>, body = '<title>cached</title>') {
  await (await caches.open(cacheNames(V).shell)).put('/index.html', html(body));
}

describe('routeOf', () => {
  it('leaves the API, sockets, uploads, stickers, the worker itself, foreign origins, writes and ranges to the network', () => {
    expect(routeOf(req('/play/1', { origin: 'https://other.test', mode: 'navigate' }), ORIGIN)).toBe('pass');
    expect(routeOf(req('/play/1', { method: 'POST', mode: 'navigate' }), ORIGIN)).toBe('pass');
    expect(routeOf(req('/api/me'), ORIGIN)).toBe('pass');
    expect(routeOf(req('/api/auth/callback/google', { mode: 'navigate' }), ORIGIN)).toBe('pass');
    expect(routeOf(req('/socket.io/?EIO=4&transport=websocket'), ORIGIN)).toBe('pass');
    expect(routeOf(req('/uploads/x.webp'), ORIGIN)).toBe('pass');
    expect(routeOf(req('/uploads/x.webp', { mode: 'navigate' }), ORIGIN)).toBe('pass');
    expect(routeOf(req('/stickers/a.png'), ORIGIN)).toBe('pass');
    expect(routeOf(req('/sw.js'), ORIGIN)).toBe('pass');
    expect(routeOf(req('/assets/song-abc.mp3', { headers: { range: 'bytes=0-' } }), ORIGIN)).toBe('pass');
    expect(routeOf(req('/maps/world.svg'), ORIGIN)).toBe('pass');
  });

  it('handles pages and hashed assets', () => {
    expect(routeOf(req('/play/123456', { mode: 'navigate' }), ORIGIN)).toBe('navigate');
    expect(routeOf(req('/', { mode: 'navigate' }), ORIGIN)).toBe('navigate');
    expect(routeOf(req('/assets/index-abc.js'), ORIGIN)).toBe('asset');
  });
});

describe('handleNavigate', () => {
  it('answers from the network and refreshes the cached shell', async () => {
    const { d, caches } = deps(async () => html('<title>fresh</title>'));
    await seedShell(caches, '<title>old</title>');
    const response = await handleNavigate(d, V, navRequest('/play/123456'), 'uk');
    expect(await response.text()).toBe('<title>fresh</title>');
    const cached = await (await caches.open(cacheNames(V).shell)).match('/index.html');
    expect(await cached?.text()).toBe('<title>fresh</title>');
  });

  it('falls back to the cached shell when the network fails', async () => {
    const { d, caches } = deps(async () => {
      throw new TypeError('Failed to fetch');
    });
    await seedShell(caches);
    const response = await handleNavigate(d, V, navRequest('/history'), 'uk');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<title>cached</title>');
  });

  it('serves the cached shell when the network is too slow and still stores the late answer', async () => {
    let answer: (response: Response) => void = () => {};
    const { d, caches, fireTimers, timers } = deps(() => new Promise<Response>((resolve) => (answer = resolve)));
    await seedShell(caches);
    const pending = handleNavigate(d, V, navRequest('/'), 'uk');
    await Promise.resolve();
    expect(timers[0]?.ms).toBe(NAV_TIMEOUT_MS);
    fireTimers();
    expect(await (await pending).text()).toBe('<title>cached</title>');
    answer(html('<title>late</title>'));
    await vi.waitFor(async () => {
      const cached = await (await caches.open(cacheNames(V).shell)).match('/index.html');
      expect(await cached?.text()).toBe('<title>late</title>');
    });
  });

  it('shows the offline page in the browser language when there is neither network nor cache', async () => {
    const { d } = deps(async () => {
      throw new TypeError('Failed to fetch');
    });
    const request = navRequest('/', 'pl-PL,pl;q=0.9');
    const response = await handleNavigate(d, V, request, localeFromHeader(request.headers.get('accept-language')));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).toContain(plPush.swOfflineTitle);
    expect(body).toContain('lang="pl"');
  });

  it('never caches redirects or errors', async () => {
    for (const make of [() => html('<title>moved</title>', { status: 404 }), () => Object.defineProperty(html('<title>moved</title>'), 'redirected', { value: true })]) {
      const { d, caches } = deps(async () => make());
      await handleNavigate(d, V, navRequest('/'), 'uk');
      expect(await (await caches.open(cacheNames(V).shell)).match('/index.html')).toBeUndefined();
    }
  });

  it('prefers the cached shell over a server error', async () => {
    const { d, caches } = deps(async () => html('bad gateway', { status: 502 }));
    await seedShell(caches);
    expect(await (await handleNavigate(d, V, navRequest('/'), 'uk')).text()).toBe('<title>cached</title>');
  });
});

describe('handleAsset', () => {
  it('serves a cached file without the network', async () => {
    const { d, caches } = deps(async () => js('network'));
    await (await caches.open(cacheNames(V).assets)).put('/assets/a-1.js', js('cached'));
    const response = await handleAsset(d, V, new Request(ORIGIN + '/assets/a-1.js'));
    expect(await response.text()).toBe('cached');
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('finds precached shell files too', async () => {
    const { d, caches } = deps(async () => js('network'));
    await (await caches.open(cacheNames(V).shell)).put('/assets/index-1.js', js('shell'));
    expect(await (await handleAsset(d, V, new Request(ORIGIN + '/assets/index-1.js'))).text()).toBe('shell');
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('fetches a missing file once and keeps it', async () => {
    const { d, caches } = deps(async () => js('lazy chunk'));
    expect(await (await handleAsset(d, V, new Request(ORIGIN + '/assets/en-1.js'))).text()).toBe('lazy chunk');
    const cached = await (await caches.open(cacheNames(V).assets)).match('/assets/en-1.js');
    expect(await cached?.text()).toBe('lazy chunk');
  });

  it('keeps neither a page nor a 404 under a chunk name', async () => {
    for (const make of [() => html('<!doctype html>'), () => js('{"error":"not_found"}', { status: 404 })]) {
      const { d, caches } = deps(async () => make());
      await handleAsset(d, V, new Request(ORIGIN + '/assets/old-1.js'));
      expect(await (await caches.open(cacheNames(V).assets)).match('/assets/old-1.js')).toBeUndefined();
    }
  });
});

describe('precacheShell and dropOldCaches', () => {
  it('stores what it can and never fails the install', async () => {
    const { d, caches } = deps(async (request) => {
      const path = String(request);
      if (path === '/assets/broken.js') throw new TypeError('Failed to fetch');
      return path === '/index.html' ? html('<title>app</title>') : js(path);
    });
    await expect(precacheShell(d, V, ['/index.html', '/assets/index-1.js', '/assets/broken.js', '/manifest.webmanifest'])).resolves.toBeUndefined();
    const shell = await caches.open(cacheNames(V).shell);
    expect(await (await shell.match('/index.html'))?.text()).toBe('<title>app</title>');
    expect(await (await shell.match('/assets/index-1.js'))?.text()).toBe('/assets/index-1.js');
    expect(await shell.match('/assets/broken.js')).toBeUndefined();
  });

  it('survives a broken cache storage', async () => {
    const { d } = deps(async () => js('x'));
    d.caches.open = async () => {
      throw new Error('quota');
    };
    await expect(precacheShell(d, V, ['/index.html'])).resolves.toBeUndefined();
  });

  it('drops only our older caches', async () => {
    const { d, caches } = deps(async () => js('x'));
    for (const name of ['quiz-shell-old', 'quiz-assets-old', cacheNames(V).shell, cacheNames(V).assets, 'other']) await caches.open(name);
    await dropOldCaches(d, V);
    expect((await caches.keys()).sort()).toEqual([cacheNames(V).assets, cacheNames(V).shell, 'other'].sort());
  });
});

describe('offline page', () => {
  it('is a small right-to-left page in Arabic with a real retry button', async () => {
    const response = offlinePage('ar');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('dir="rtl"');
    expect(body).toContain('<button');
    expect(body).toContain('location.reload()');
    expect(body).toContain('name="viewport"');
    expect(body).not.toMatch(/<(script|link)[\s>]/);
  });

  it('falls back to Ukrainian and escapes its texts', async () => {
    const body = await offlinePage('xx').text();
    expect(body).toContain('lang="uk"');
    expect(body).toContain('dir="ltr"');
    expect(body).toContain('Немає зв’язку');
    expect(body).not.toMatch(/\{\w+\}/);
  });

  it('reads the first known language of the header', () => {
    expect(localeFromHeader('pl-PL,pl;q=0.9')).toBe('pl');
    expect(localeFromHeader('fr-FR,de;q=0.8,en;q=0.5')).toBe('de');
    expect(localeFromHeader('EN-us')).toBe('en');
    expect(localeFromHeader('fr')).toBe('uk');
    expect(localeFromHeader(null)).toBe('uk');
  });
});
