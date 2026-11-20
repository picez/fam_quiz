import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./strings/en.json', () => ({ default: { pushOpenedTitle: 'Game “{title}” has started' } }));

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

describe('onPush language', () => {
  const opened = { kind: 'opened', eventId: 'e1', title: 'Писанки', code: '123456' };
  const titleFor = async (extra: object) => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ ...opened, ...extra }) }, 'Europe/Kyiv');
    return (scope.registration.showNotification.mock.calls[0] as unknown as [string, unknown])[0];
  };

  it('uses the payload locale', async () => {
    expect(await titleFor({ locale: 'en' })).toBe('Game “Писанки” has started');
  });
  it('falls back to uk for an unknown or missing locale', async () => {
    expect(await titleFor({ locale: 'ru' })).toBe('Гра «Писанки» почалась');
    expect(await titleFor({})).toBe('Гра «Писанки» почалась');
  });
  it('uses uk text for a key the locale lacks', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ ...opened, locale: 'en' }) }, 'Europe/Kyiv');
    expect((scope.registration.showNotification.mock.calls[0] as unknown as [string, { body: string }])[1].body).toBe(
      'Ведучий відкрив гру. Торкнися, щоб приєднатися.',
    );
  });
  it('formats the cancelled date with Western digits in ar', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'cancelled', eventId: 'e1', title: 'x', startsAt: '2026-11-08T16:30:00.000Z', locale: 'ar' }) }, 'Europe/Kyiv');
    const body = (scope.registration.showNotification.mock.calls[0] as unknown as [string, { body: string }])[1].body;
    expect(body).toMatch(/[0-9]/);
    expect(body).not.toMatch(/[٠-٩]/);
  });
});

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

  it('shows the bot notice under one tag per plan', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'bot', planId: 'P', title: 'Озера', startsAt: '2026-11-20T17:00:00.000Z', code: '123456' }) }, 'Europe/Kyiv');
    expect(scope.registration.showNotification).toHaveBeenCalledWith(
      'Квіз-бот відкрив гру «Озера»',
      expect.objectContaining({ tag: 'bot-P', data: { url: '/play/123456' } }),
    );
  });

  it('shows the broadcast under one tag per broadcast', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'broadcast', broadcastId: 'B', title: 'Нова вікторина', text: 'Заходь', url: null }) }, 'Europe/Kyiv');
    expect(scope.registration.showNotification).toHaveBeenCalledWith(
      'Нова вікторина',
      expect.objectContaining({ body: 'Заходь', tag: 'broadcast-B', data: { url: '/' } }),
    );
  });

  it('shows a problem reply under its own tag', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'problem_reply', reportId: 'R', text: 'Виправили' }) }, 'Europe/Kyiv');
    expect(scope.registration.showNotification).toHaveBeenCalledWith(
      'Відповідь на твоє повідомлення',
      expect.objectContaining({ body: 'Виправили', tag: 'problem-R', data: { url: '/report' } }),
    );
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
    const reply = { kind: 'problem_reply', reportId: 'R', text: 'X' };
    expect(isPushPayload(reply)).toBe(true);
    expect(isPushPayload({ ...reply, text: undefined })).toBe(false);
    expect(isPushPayload({ ...reply, reportId: undefined })).toBe(false);
    const bot = { kind: 'bot', planId: 'P', title: 'T', startsAt: 'x', code: null };
    expect(isPushPayload(bot)).toBe(true);
    expect(isPushPayload({ ...bot, code: '123456' })).toBe(true);
    expect(isPushPayload({ ...bot, code: 5 })).toBe(false);
    expect(isPushPayload({ ...bot, planId: undefined })).toBe(false);
    const broadcast = { kind: 'broadcast', broadcastId: 'B', title: 'T', text: 'X', url: null };
    expect(isPushPayload(broadcast)).toBe(true);
    expect(isPushPayload({ ...broadcast, url: '/library' })).toBe(true);
    expect(isPushPayload({ ...broadcast, text: undefined })).toBe(false);
    expect(isPushPayload({ ...broadcast, url: 5 })).toBe(false);
    expect(isPushPayload({ ...broadcast, broadcastId: undefined })).toBe(false);
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

  it('opens another site in a new window and leaves ours alone', async () => {
    const client = { url: 'https://quiz.test/feed', focus: vi.fn(() => Promise.resolve()), navigate: vi.fn(() => Promise.resolve()) };
    const scope = fakeScope([client]);
    await onNotificationClick(scope, 'https://example.com/news');
    expect(scope.clients.openWindow).toHaveBeenCalledWith('https://example.com/news');
    expect(client.navigate).not.toHaveBeenCalled();
    expect(client.focus).not.toHaveBeenCalled();
  });

  it('navigates our own absolute address in the open window', async () => {
    const client = { url: 'https://quiz.test/feed', focus: vi.fn(() => Promise.resolve()), navigate: vi.fn(() => Promise.resolve()) };
    const scope = fakeScope([client]);
    await onNotificationClick(scope, 'https://quiz.test/library');
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith('https://quiz.test/library');
    expect(scope.clients.openWindow).not.toHaveBeenCalled();
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
