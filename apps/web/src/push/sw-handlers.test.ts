import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPushPayload,
  loadServerKey,
  onNotificationClick,
  onPush,
  onSubscriptionChange,
  postSubscription,
  type SwClient,
  type SwScope,
} from './sw-handlers';

function fakeScope(clients: SwClient[] = [], subscription: { toJSON(): unknown } = { toJSON: () => ({ endpoint: 'x' }) }) {
  return {
    registration: {
      showNotification: vi.fn(() => Promise.resolve()),
      pushManager: { subscribe: vi.fn(() => Promise.resolve(subscription)) },
    },
    clients: { matchAll: vi.fn(() => Promise.resolve(clients)), openWindow: vi.fn(() => Promise.resolve(null)) },
    location: { origin: 'https://quiz.test' },
  } satisfies SwScope;
}

const throwing = {
  json: () => {
    throw new Error('bad');
  },
};

describe('onPush', () => {
  it('shows the opened notice', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'opened', eventId: 'E', title: 'Вечір загадок', code: '123456' }) }, 'Europe/Kyiv');
    expect(scope.registration.showNotification).toHaveBeenCalledWith('Гра «Вечір загадок» почалась', {
      body: 'Ведучий відкрив гру. Торкнися, щоб приєднатися.',
      tag: 'event-E',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: '/play/123456' },
    });
  });

  it('shows a generic notice for an invalid payload, keeping a string title', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'liked', title: 'Привіт' }) }, 'Europe/Kyiv');
    const call = scope.registration.showNotification.mock.calls[0] as unknown as [string, { data: { url: string } }];
    expect(call[0]).toBe('Привіт');
    expect(call[1].data.url).toBe('/');
  });

  it('shows a generic notice for missing or unparsable data', async () => {
    const scope = fakeScope();
    await onPush(scope, null, 'Europe/Kyiv');
    await onPush(scope, throwing, 'Europe/Kyiv');
    expect(scope.registration.showNotification).toHaveBeenCalledTimes(2);
    expect((scope.registration.showNotification.mock.calls[0] as unknown as string[])[0]).toBe('Квіз');
  });

  it('falls back when the date is malformed', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'reminder', eventId: 'E', title: 'Вечір', startsAt: 'not a date' }) }, 'Europe/Kyiv');
    expect(scope.registration.showNotification).toHaveBeenCalledTimes(1);
    expect((scope.registration.showNotification.mock.calls[0] as unknown as string[])[0]).toBe('Вечір');
  });
});

describe('isPushPayload', () => {
  it('accepts the three shapes and rejects the rest', () => {
    expect(isPushPayload({ kind: 'reminder', eventId: 'E', title: 'T', startsAt: 'x' })).toBe(true);
    expect(isPushPayload({ kind: 'opened', eventId: 'E', title: 'T', code: '1' })).toBe(true);
    expect(isPushPayload({ kind: 'cancelled', eventId: 'E', title: 'T', startsAt: 'x' })).toBe(true);
    expect(isPushPayload({ kind: 'opened', eventId: 'E', title: 'T' })).toBe(false);
    expect(isPushPayload({ kind: 'reminder', eventId: 'E', title: 'T', startsAt: 5 })).toBe(false);
    expect(isPushPayload({ kind: 'liked', eventId: 'E', title: 'T' })).toBe(false);
    expect(isPushPayload(null)).toBe(false);
    expect(isPushPayload('x')).toBe(false);
  });
});

describe('onNotificationClick', () => {
  it('focuses and navigates an open window of this origin', async () => {
    const client = {
      url: 'https://quiz.test/feed',
      focus: vi.fn(() => Promise.resolve()),
      navigate: vi.fn(() => Promise.resolve()),
    };
    const scope = fakeScope([client]);
    await onNotificationClick(scope, '/play/123456');
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith('/play/123456');
    expect(scope.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a window when none is open', async () => {
    const scope = fakeScope();
    await onNotificationClick(scope, '/play/123456');
    expect(scope.clients.openWindow).toHaveBeenCalledWith('/play/123456');
  });

  it('opens a window when navigate rejects', async () => {
    const client = {
      url: 'https://quiz.test/feed',
      focus: vi.fn(() => Promise.resolve()),
      navigate: vi.fn(() => Promise.reject(new Error('no'))),
    };
    const scope = fakeScope([client]);
    await onNotificationClick(scope, '/play/1');
    expect(scope.clients.openWindow).toHaveBeenCalledWith('/play/1');
  });

  it('does not touch a window of another origin', async () => {
    const other = { url: 'https://other.test/', focus: vi.fn(() => Promise.resolve()), navigate: vi.fn(() => Promise.resolve()) };
    const scope = fakeScope([other]);
    await onNotificationClick(scope, '/x');
    expect(other.focus).not.toHaveBeenCalled();
    expect(scope.clients.openWindow).toHaveBeenCalledWith('/x');
  });
});

describe('onSubscriptionChange', () => {
  it('resubscribes with the old key and posts the result', async () => {
    const scope = fakeScope([], { toJSON: () => ({ endpoint: 'new' }) });
    const post = vi.fn(() => Promise.resolve());
    const key = new ArrayBuffer(4);
    await onSubscriptionChange(scope, key, post);
    expect(scope.registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key });
    expect(post).toHaveBeenCalledWith({ endpoint: 'new' });
  });

  it('loads the server key when the old one is missing', async () => {
    const scope = fakeScope([], { toJSON: () => ({ endpoint: 'new' }) });
    const post = vi.fn(() => Promise.resolve());
    const key = new ArrayBuffer(2);
    await onSubscriptionChange(scope, null, post, () => Promise.resolve(key));
    expect(scope.registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key });
    expect(post).toHaveBeenCalledWith({ endpoint: 'new' });
  });

  it('does nothing when there is no key anywhere', async () => {
    const scope = fakeScope();
    const post = vi.fn(() => Promise.resolve());
    await onSubscriptionChange(scope, null, post, () => Promise.resolve(null));
    expect(scope.registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('network helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches /api/push/key and decodes the base64url key', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ publicKey: '_-8' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const key = await loadServerKey();
    expect(fetchMock).toHaveBeenCalledWith('/api/push/key', { credentials: 'same-origin' });
    expect([...new Uint8Array(key!)]).toEqual([0xff, 0xef]);
  });

  it('returns null for a null key', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ publicKey: null }) })));
    expect(await loadServerKey()).toBeNull();
  });

  it('throws when the post is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 })));
    await expect(postSubscription({})).rejects.toThrow();
  });
});
