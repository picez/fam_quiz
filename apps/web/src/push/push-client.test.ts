// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePushSubscription } from '../api';
import { disablePush, keyToBytes, pushSupport, type BrowserEnv } from './push-client';

vi.mock('../api', () => ({ deletePushSubscription: vi.fn(), savePushSubscription: vi.fn() }));

const android: BrowserEnv = {
  prod: true,
  serviceWorker: true,
  pushManager: true,
  notification: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/140',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
  standalone: false,
};
const iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const iphone: BrowserEnv = { ...android, userAgent: iphoneUa, platform: 'iPhone', pushManager: false, notification: false };

describe('pushSupport', () => {
  it('supports a browser with all three APIs', () => expect(pushSupport(android)).toBe('supported'));
  it('asks an iPhone tab to use the home screen', () => expect(pushSupport(iphone)).toBe('ios-home-screen'));
  it('supports an iPhone from the home screen', () =>
    expect(pushSupport({ ...iphone, standalone: true, pushManager: true, notification: true })).toBe('supported'));
  it('treats an iPad posing as a Mac as iOS', () =>
    expect(pushSupport({ ...android, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', pushManager: false, notification: false })).toBe('ios-home-screen'));
  it('hides on an old iOS from the home screen', () => expect(pushSupport({ ...iphone, standalone: true })).toBe('unsupported'));
  it('hides outside production', () => expect(pushSupport({ ...android, prod: false })).toBe('unsupported'));
  it('hides in a browser without push', () => expect(pushSupport({ ...android, pushManager: false })).toBe('unsupported'));
});

describe('keyToBytes', () => {
  it('decodes base64url', () => {
    expect(Array.from(keyToBytes('AQAB'))).toEqual([1, 0, 1]);
    expect(Array.from(keyToBytes('-_8'))).toEqual([251, 255]);
  });
});

describe('disablePush', () => {
  const fake = () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', unsubscribe: vi.fn(async () => true) });
  const install = (sub: ReturnType<typeof fake>) =>
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) },
    });
  beforeEach(() => vi.clearAllMocks());

  it('deletes on the server, then unsubscribes', async () => {
    const sub = fake();
    install(sub);
    vi.mocked(deletePushSubscription).mockResolvedValue({ ok: true });
    await disablePush();
    expect(deletePushSubscription).toHaveBeenCalledWith(sub.endpoint);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('unsubscribes even when the server refuses', async () => {
    const sub = fake();
    install(sub);
    vi.mocked(deletePushSubscription).mockResolvedValue({ ok: false, error: 'offline' });
    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
});
