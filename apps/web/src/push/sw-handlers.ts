import { pushPayloadSchema } from '@quiz/shared';
import { pushNotice } from './push-text';

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

/** Розбирає data.json(); невідоме чи биті дані → нічого не показує. */
export async function onPush(scope: SwScope, data: { json(): unknown } | null, zone: string): Promise<void> {
  if (data === null) return;
  let raw: unknown;
  try {
    raw = data.json();
  } catch {
    return;
  }
  const parsed = pushPayloadSchema.safeParse(raw);
  if (!parsed.success) return;
  const notice = pushNotice(parsed.data, zone);
  await scope.registration.showNotification(notice.title, {
    body: notice.body,
    tag: notice.tag,
    renotify: true,
    icon: ICON,
    badge: ICON,
    data: { url: notice.url },
  });
}

/** Вікно того ж origin є → focus + navigate(url); інакше openWindow(url). */
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
  await same.navigate(url);
}

/** Перепідписати тим самим ключем і віддати нову підписку серверові. */
export async function onSubscriptionChange(
  scope: SwScope,
  oldKey: ArrayBuffer | null,
  post: (body: unknown) => Promise<unknown>,
): Promise<void> {
  const subscription = await scope.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: oldKey });
  await post(subscription.toJSON());
}

/** POST /api/me/push з cookie сесії (same-origin). */
export function postSubscription(body: unknown): Promise<unknown> {
  return globalThis.fetch('/api/me/push', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
