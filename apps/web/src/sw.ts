import { viewerZone } from './calendar/calendar-time';
import { onNotificationClick, onPush, onSubscriptionChange, postSubscription, type SwScope } from './push/sw-handlers';

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

const scope = self as unknown as SwScope & {
  addEventListener(type: string, listener: (event: never) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
};

function listen<E>(type: string, handler: (event: E) => void): void {
  scope.addEventListener(type, handler as (event: never) => void);
}

listen<WaitEvent>('install', (event) => event.waitUntil(scope.skipWaiting()));
listen<WaitEvent>('activate', (event) => event.waitUntil(scope.clients.claim()));
listen<PushEvt>('push', (event) => event.waitUntil(onPush(scope, event.data, viewerZone())));
listen<ClickEvt>('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(onNotificationClick(scope, event.notification.data?.url ?? '/'));
});
listen<ChangeEvt>('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription?.options?.applicationServerKey ?? null;
  event.waitUntil(onSubscriptionChange(scope, key, postSubscription));
});
