import { z } from 'zod';
import { localeSchema, type Locale } from './locale';

// shared has no DOM/node lib; URL exists at runtime in browsers and Node.
declare const URL: new (input: string) => { protocol: string; hostname: string };

export const PUSH_REMINDER_BEFORE_MS = 3_600_000;
export const PUSH_TICK_MS = 60_000;
export const PUSH_MAX_SUBSCRIPTIONS = 10;
export const PUSH_ENDPOINT_MAX = 1000;
export const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
] as const;
export const PUSH_KINDS = ['reminder', 'opened', 'cancelled'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export type PushPayload =
  | { kind: 'reminder'; eventId: string; title: string; startsAt: string; locale?: Locale }
  | { kind: 'opened'; eventId: string; title: string; code: string; locale?: Locale }
  | { kind: 'cancelled'; eventId: string; title: string; startsAt: string; locale?: Locale };

/**
 * Лише https://хост[/шлях] з друкованих ASCII без пробілів: без userinfo, порту, `;`, `{`, лапок, `\` тощо в хості,
 * бо web-push надсилає через застарілий url.parse, який читає такі рядки як інший хост.
 * Далі хост = h або закінчується на '.' + h для h з PUSH_HOSTS; інакше false (також для не-URL).
 */
const PUSH_ENDPOINT_SHAPE = /^https:\/\/[a-z0-9.-]+(\/[!-~]*)?$/i;
export function pushEndpointAllowed(endpoint: string): boolean {
  if (!PUSH_ENDPOINT_SHAPE.test(endpoint)) return false;
  let url: { protocol: string; hostname: string };
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().max(PUSH_ENDPOINT_MAX).refine(pushEndpointAllowed),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict(),
  })
  .strict();
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(PUSH_ENDPOINT_MAX) }).strict();

const eventBase = { eventId: z.string(), title: z.string(), locale: localeSchema.optional() };
/** Розбір даних пушу в сервіс-воркері: невідоме → не пройде. */
export const pushPayloadSchema: z.ZodType<PushPayload> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reminder'), ...eventBase, startsAt: z.string() }),
  z.object({ kind: z.literal('opened'), ...eventBase, code: z.string() }),
  z.object({ kind: z.literal('cancelled'), ...eventBase, startsAt: z.string() }),
]);
