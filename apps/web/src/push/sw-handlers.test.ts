import { describe, expect, it, vi } from 'vitest';
import { onNotificationClick, onPush, onSubscriptionChange, type SwClient, type SwScope } from './sw-handlers';

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

  it('ignores unknown, missing and broken data', async () => {
    const scope = fakeScope();
    await onPush(scope, { json: () => ({ kind: 'liked' }) }, 'Europe/Kyiv');
    await onPush(scope, null, 'Europe/Kyiv');
    await onPush(
      scope,
      {
        json: () => {
          throw new Error('bad');
        },
      },
      'Europe/Kyiv',
    );
    expect(scope.registration.showNotification).not.toHaveBeenCalled();
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
});
