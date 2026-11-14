import { viewerZone } from './calendar/calendar-time';
import { onNotificationClick, onPush, onSubscriptionChange, postSubscription, type SwScope } from './push/sw-handlers';
import { dropOldCaches, handleAsset, handleNavigate, localeFromHeader, precacheShell, routeOf, type CacheDeps } from './sw/shell-cache';

interface WaitEvent {
  waitUntil(promise: Promise<unknown>): void;
}
interface PushEvt extends WaitEvent {
  data: { json(): unknown } | null;
}
interface ClickEvt extends WaitEvent {
  notification: { close(): void; data: { url?: string } | null };
}
interface ChangeEvt extends WaitEvent {
  oldSubscription?: { options?: { applicationServerKey: ArrayBuffer | null } } | null;
}
interface FetchEvt extends WaitEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
}

const scope = self as unknown as SwScope & {
  addEventListener(type: string, listener: (event: never) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  caches: CacheDeps['caches'];
  fetch: CacheDeps['fetch'];
  setTimeout: CacheDeps['setTimeout'];
  navigator?: { languages?: readonly string[] };
};

function listen<E>(type: string, handler: (event: E) => void): void {
  scope.addEventListener(type, handler as (event: never) => void);
}

// Кеш оболонки (32): версія — хеш списку файлів, його вписує збірка (vite.config.ts, serviceWorker()).
const SHELL_FILES = ['/index.html', ...__SHELL__, '/manifest.webmanifest', '/icon-192.png'];
const deps: CacheDeps = {
  caches: scope.caches,
  fetch: (request) => scope.fetch(request),
  setTimeout: (fn, ms) => scope.setTimeout(fn, ms),
};

listen<WaitEvent>('install', (event) => event.waitUntil(Promise.all([precacheShell(deps, __SHELL_VERSION__, SHELL_FILES), scope.skipWaiting()])));
listen<WaitEvent>('activate', (event) => event.waitUntil(Promise.all([dropOldCaches(deps, __SHELL_VERSION__), scope.clients.claim()])));
listen<FetchEvt>('fetch', (event) => {
  const route = routeOf(event.request, scope.location.origin);
  // /api, /socket.io, /uploads, стікери, sw.js, Range і чужі адреси: respondWith не кличемо, браузер іде в мережу сам.
  if (route === 'pass') return;
  if (route === 'navigate') {
    // Навігаційний запит у воркері зазвичай не несе Accept-Language: тоді мови браузера з navigator.languages.
    const locale = localeFromHeader(event.request.headers.get('accept-language') ?? scope.navigator?.languages?.join(',') ?? null);
    event.respondWith(handleNavigate(deps, __SHELL_VERSION__, event.request, locale, (promise) => event.waitUntil(promise)));
    return;
  }
  event.respondWith(handleAsset(deps, __SHELL_VERSION__, event.request));
});
listen<PushEvt>('push', (event) => event.waitUntil(onPush(scope, event.data, viewerZone())));
listen<ClickEvt>('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(onNotificationClick(scope, event.notification.data?.url ?? '/'));
});
listen<ChangeEvt>('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription?.options?.applicationServerKey ?? null;
  event.waitUntil(onSubscriptionChange(scope, key, postSubscription));
});
