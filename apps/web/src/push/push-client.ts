import { deletePushSubscription, savePushSubscription } from '../api';

export type PushSupport = 'supported' | 'ios-home-screen' | 'unsupported';

export interface BrowserEnv {
  prod: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}

export function browserEnv(): BrowserEnv {
  return {
    prod: import.meta.env.PROD,
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone:
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as { standalone?: boolean }).standalone === true,
  };
}

/** Чиста: !prod → unsupported; усі три API → supported; iOS і не standalone → ios-home-screen; інакше unsupported. */
export function pushSupport(env: BrowserEnv): PushSupport {
  if (!env.prod) return 'unsupported';
  if (env.serviceWorker && env.pushManager && env.notification) return 'supported';
  const ios = /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
  return ios && !env.standalone ? 'ios-home-screen' : 'unsupported';
}

export function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Підписка цього пристрою або null (немає реєстрації — null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Ключ підписки (options.applicationServerKey) збігається з publicKey. Браузер не повідомив ключ (null) → вважаємо тим самим, підписку лишаємо. */
export function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const key = sub.options.applicationServerKey;
  if (key === null) return true;
  const have = new Uint8Array(key);
  const want = keyToBytes(publicKey);
  return have.length === want.length && have.every((byte, i) => byte === want[i]);
}

export const SW_READY_TIMEOUT_MS = 10_000;

/** serviceWorker.ready, але не довше за SW_READY_TIMEOUT_MS (воркер може так і не стати активним). */
function readyWithin(ms: number): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('service worker is not ready')), ms);
  });
  return Promise.race([navigator.serviceWorker.ready, timeout]).finally(() => clearTimeout(timer));
}

export type EnableResult = 'on' | 'denied' | 'dismissed' | 'unsupported' | 'failed';

/**
 * requestPermission (лише з дотику) → ready (≤10 с) → subscribe → savePushSubscription. Закрите вікно дозволу → 'dismissed'.
 * subscribe кинув — браузер не має push-сервісу (Opera на комп'ютері: API є, а підписатися нема куди) → 'unsupported';
 * воркер не готовий чи сервер не зберіг — 'failed' (можна спробувати ще раз).
 */
export async function enablePush(publicKey: string): Promise<EnableResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'dismissed';
    const registration = await readyWithin(SW_READY_TIMEOUT_MS);
    let sub: PushSubscription;
    try {
      sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
    } catch {
      return 'unsupported';
    }
    const json = sub.toJSON();
    const saved = await savePushSubscription({
      endpoint: sub.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    });
    if (!saved.ok) {
      await sub.unsubscribe().catch(() => false);
      return 'failed';
    }
    return 'on';
  } catch {
    return 'failed';
  }
}

/** Є підписка → deletePushSubscription(endpoint) (помилку ковтає) → unsubscribe(). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub === null) return;
  await deletePushSubscription(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => false);
}
