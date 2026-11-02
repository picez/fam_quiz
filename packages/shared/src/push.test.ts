import { describe, expect, it } from 'vitest';
import { pushEndpointAllowed, pushPayloadSchema, pushSubscriptionSchema, pushUnsubscribeSchema } from './push';

const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BP', auth: 'au' } };

describe('pushEndpointAllowed', () => {
  it('accepts known push services', () => {
    expect(pushEndpointAllowed('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(pushEndpointAllowed('https://web.push.apple.com/QGabc')).toBe(true);
    expect(pushEndpointAllowed('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(pushEndpointAllowed('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(pushEndpointAllowed('http://fcm.googleapis.com/x')).toBe(false);
    expect(pushEndpointAllowed('https://evilfcm.googleapis.com.example.com/x')).toBe(false);
    expect(pushEndpointAllowed('https://evilfcm.googleapis.com/x')).toBe(false);
    expect(pushEndpointAllowed('https://localhost/x')).toBe(false);
    expect(pushEndpointAllowed('https://127.0.0.1/x')).toBe(false);
    expect(pushEndpointAllowed('не адреса')).toBe(false);
  });
});

describe('pushSubscriptionSchema', () => {
  it('accepts a browser toJSON with null, numeric or missing expirationTime', () => {
    expect(pushSubscriptionSchema.parse({ ...ok, expirationTime: null }).endpoint).toBe(ok.endpoint);
    expect(pushSubscriptionSchema.safeParse({ ...ok, expirationTime: 1793600000000 }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects bad shapes', () => {
    expect(pushSubscriptionSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...ok, keys: { ...ok.keys, x: 'y' } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...ok, keys: { p256dh: 'BP', auth: '' } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...ok, endpoint: 'https://fcm.googleapis.com/' + 'a'.repeat(1000) }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...ok, endpoint: 'https://example.com/x' }).success).toBe(false);
  });
});

describe('pushUnsubscribeSchema', () => {
  it('needs a bounded endpoint only', () => {
    expect(pushUnsubscribeSchema.safeParse({ endpoint: 'x' }).success).toBe(true);
    expect(pushUnsubscribeSchema.safeParse({ endpoint: '' }).success).toBe(false);
    expect(pushUnsubscribeSchema.safeParse({ endpoint: 'x', y: 1 }).success).toBe(false);
  });
});

describe('pushPayloadSchema', () => {
  it('parses known kinds and rejects unknown', () => {
    expect(pushPayloadSchema.safeParse({ kind: 'opened', eventId: 'e', title: 'Вечір', code: '123456' }).success).toBe(true);
    expect(pushPayloadSchema.safeParse({ kind: 'liked' }).success).toBe(false);
  });
});
