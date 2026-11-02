import webpush from 'web-push';
import type { VapidKeys } from './config';
import type { PushSend } from './push';

/** Єдине місце, що імпортує бібліотеку web-push і знає приватний ключ. */
export function webPushSender(keys: VapidKeys): PushSend {
  const vapidDetails = { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return async (target, payload, options) => {
    try {
      const res = await webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, payload, {
        vapidDetails,
        TTL: options.ttl,
        urgency: options.urgency,
        timeout: 10_000,
      });
      return { status: res.statusCode };
    } catch (error) {
      if (error instanceof webpush.WebPushError) return { status: error.statusCode };
      return { status: 0 };
    }
  };
}
