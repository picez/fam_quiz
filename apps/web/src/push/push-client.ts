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

/** Ключ підписки (options.applicationServerKey) збігається з publicKey. */
export function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const key = sub.options.applicationServerKey;
  if (key === null) return false;
  const have = new Uint8Array(key);
  const want = keyToBytes(publicKey);
  return have.length === want.length && have.every((byte, i) => byte === want[i]);
}

/** requestPermission (лише з дотику) → ready → subscribe → savePushSubscription. */
export async function enablePush(publicKey: string): Promise<'on' | 'denied' | 'failed'> {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'failed';
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
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
