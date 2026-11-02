import type { PushPayload } from '@quiz/shared';
import { pushString } from './push-strings';
import { pushNotice, type PushNotice } from './push-text';

export interface SwClient {
  url: string;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
}

export interface SwScope {
  registration: {
    showNotification(
      title: string,
      options: { body: string; tag: string; renotify: boolean; icon: string; badge: string; data: { url: string } },
    ): Promise<void>;
    pushManager: {
      subscribe(o: { userVisibleOnly: true; applicationServerKey: ArrayBuffer | null }): Promise<{ toJSON(): unknown }>;
    };
  };
  clients: {
    matchAll(o: { type: 'window'; includeUncontrolled: true }): Promise<SwClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
  location: { origin: string };
}

const ICON = '/icon-192.png';
const KINDS = ['reminder', 'opened', 'cancelled'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Легка перевірка форми пуша (zod у воркер не тягнемо). */
export function isPushPayload(raw: unknown): raw is PushPayload {
  if (!isObject(raw) || typeof raw.kind !== 'string' || !KINDS.includes(raw.kind)) return false;
  if (typeof raw.eventId !== 'string' || typeof raw.title !== 'string') return false;
  return raw.kind === 'opened' ? typeof raw.code === 'string' : typeof raw.startsAt === 'string';
}

function fallbackNotice(raw: unknown): PushNotice {
  const title =
    isObject(raw) && typeof raw.title === 'string' && raw.title !== '' ? raw.title : pushString('pushFallbackTitle');
  return { title, body: pushString('pushFallbackBody'), url: '/', tag: 'push-fallback' };
}

/** Браузер вимагає показати сповіщення на кожен пуш: що б не прийшло, показуємо хоч загальне. */
export async function onPush(scope: SwScope, data: { json(): unknown } | null, zone: string): Promise<void> {
  let raw: unknown = null;
  if (data !== null) {
    try {
      raw = data.json();
    } catch {
      raw = null;
    }
  }
  let notice: PushNotice;
  try {
    notice = isPushPayload(raw) ? pushNotice(raw, zone) : fallbackNotice(raw);
  } catch {
    notice = fallbackNotice(raw);
  }
  await scope.registration.showNotification(notice.title, {
    body: notice.body,
    tag: notice.tag,
    renotify: true,
    icon: ICON,
    badge: ICON,
    data: { url: notice.url },
  });
}

/** Вікно того ж origin є → focus + navigate(url) (збій навігації → openWindow); інакше openWindow(url). */
export async function onNotificationClick(scope: SwScope, url: string): Promise<void> {
  const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const same = windows.find((w) => {
    try {
      return new URL(w.url).origin === scope.location.origin;
    } catch {
      return false;
    }
  });
  if (same === undefined) {
    await scope.clients.openWindow(url);
    return;
  }
  await same.focus();
  try {
    await same.navigate(url);
  } catch {
    await scope.clients.openWindow(url);
  }
}

function decodeKey(key: string): ArrayBuffer {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '=');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/** Відкритий ключ сервера з GET /api/push/key; немає (пуші вимкнені чи збій) → null. */
export async function loadServerKey(): Promise<ArrayBuffer | null> {
  try {
    const response = await globalThis.fetch('/api/push/key', { credentials: 'same-origin' });
    if (!response.ok) return null;
    const body = (await response.json()) as { publicKey?: unknown };
    return typeof body.publicKey === 'string' && body.publicKey !== '' ? decodeKey(body.publicKey) : null;
  } catch {
    return null;
  }
}

/** Перепідписати тим самим ключем (немає старого — ключем сервера) і віддати нову підписку серверові. */
export async function onSubscriptionChange(
  scope: SwScope,
  oldKey: ArrayBuffer | null,
  post: (body: unknown) => Promise<unknown>,
  loadKey: () => Promise<ArrayBuffer | null> = loadServerKey,
): Promise<void> {
  const key = oldKey ?? (await loadKey());
  if (key === null) return;
  const subscription = await scope.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await post(subscription.toJSON());
}

/** POST /api/me/push з cookie сесії (same-origin); не-2xx → помилка. */
export async function postSubscription(body: unknown): Promise<void> {
  const response = await globalThis.fetch('/api/me/push', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`push_post_${response.status}`);
}
