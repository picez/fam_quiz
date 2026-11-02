import webpush from 'web-push';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Impl = (...args: unknown[]) => Promise<{ statusCode: number }>;
const lib = vi.hoisted(() => ({ calls: [] as unknown[][], impl: null as unknown }));

vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    default: {
      WebPushError,
      sendNotification: (...args: unknown[]) => {
        lib.calls.push(args);
        return (lib.impl as Impl)(...args);
      },
    },
  };
});

const { webPushSender } = await import('./web-push-sender');

const keys = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:owner@example.com' };
const target = { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } };

describe('webPushSender', () => {
  beforeEach(() => {
    lib.calls.length = 0;
  });

  it('passes the options and returns the status', async () => {
    lib.impl = async () => ({ statusCode: 201 });
    expect(await webPushSender(keys)(target, '{}', { ttl: 3600, urgency: 'high' })).toEqual({ status: 201 });
    expect(lib.calls).toHaveLength(1);
    const [sub, payload, options] = lib.calls[0]!;
    expect(sub).toEqual({ endpoint: target.endpoint, keys: target.keys });
    expect(payload).toBe('{}');
    expect(options).toMatchObject({ TTL: 3600, urgency: 'high', timeout: 10000, vapidDetails: { subject: keys.subject } });
  });

  it('turns a push service refusal into its status', async () => {
    lib.impl = async () => {
      throw new webpush.WebPushError('gone', 410, {}, '', target.endpoint);
    };
    expect(await webPushSender(keys)(target, '{}', { ttl: 1, urgency: 'normal' })).toEqual({ status: 410 });
  });

  it('turns a network error into status 0', async () => {
    lib.impl = async () => {
      throw new Error('ECONNRESET');
    };
    expect(await webPushSender(keys)(target, '{}', { ttl: 1, urgency: 'normal' })).toEqual({ status: 0 });
  });

  it('never sends to an endpoint outside the allowlist and answers 410 so the row is dropped', async () => {
    lib.impl = async () => ({ statusCode: 201 });
    const bad = { ...target, endpoint: 'https://localhost;.push.apple.com/' };
    expect(await webPushSender(keys)(bad, '{}', { ttl: 1, urgency: 'normal' })).toEqual({ status: 410 });
    expect(lib.calls).toHaveLength(0);
  });
});
