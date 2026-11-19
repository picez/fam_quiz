// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Announcement } from '@quiz/shared';
import { getAnnouncement } from '../api';
import { loadAnnouncementSeen, saveAnnouncementSeen } from '../storage';
import { AnnouncementBanner } from './AnnouncementBanner';

vi.mock('../api', () => ({ getAnnouncement: vi.fn() }));

const base: Announcement = { id: 'a1', text: 'Technical break tonight', url: null, expiresAt: null, createdAt: '2026-11-19T10:00:00.000Z' };
const serve = (announcement: Announcement | null) => vi.mocked(getAnnouncement).mockResolvedValue({ ok: true, data: { announcement } });
const open = () =>
  render(
    <MemoryRouter>
      <AnnouncementBanner />
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('AnnouncementBanner', () => {
  it('shows the announcement with its link', async () => {
    serve({ ...base, url: '/library' });
    open();
    expect(await screen.findByText(base.text)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Детальніше' }).getAttribute('href')).toBe('/library');
    cleanup();
    serve({ ...base, url: 'https://example.com' });
    open();
    const link = await screen.findByRole('link', { name: 'Детальніше' });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    cleanup();
    serve(base);
    open();
    await screen.findByText(base.text);
    expect(screen.queryByRole('link', { name: 'Детальніше' })).toBeNull();
  });

  it('× hides it on this device and it stays hidden after a reload', async () => {
    serve(base);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Закрити оголошення' }));
    expect(screen.queryByText(base.text)).toBeNull();
    expect(loadAnnouncementSeen()).toBe('a1');
    cleanup();
    open();
    await vi.waitFor(() => expect(getAnnouncement).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(base.text)).toBeNull();
  });

  it('a new announcement shows again after the old one was closed', async () => {
    saveAnnouncementSeen('a1');
    serve({ ...base, id: 'a2', text: 'Another one' });
    open();
    expect(await screen.findByText('Another one')).toBeTruthy();
  });

  it('an expired one is not shown and an open one hides at its time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    serve({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() });
    open();
    await act(async () => {});
    expect(screen.queryByText(base.text)).toBeNull();
    cleanup();
    serve({ ...base, expiresAt: new Date(Date.now() + 30_000).toISOString() });
    open();
    await act(async () => {});
    expect(screen.getByText(base.text)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(30_001);
    });
    expect(screen.queryByText(base.text)).toBeNull();
  });

  it('an announcement that ends more than a day later still hides at its time on a tab left open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const day = 24 * 60 * 60 * 1000;
    serve({ ...base, expiresAt: new Date(Date.now() + day + 60 * 60 * 1000).toISOString() });
    open();
    await act(async () => {});
    expect(screen.getByText(base.text)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(day);
    });
    expect(screen.getByText(base.text)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    });
    expect(screen.queryByText(base.text)).toBeNull();
  });

  it('a malformed answer or a rejected request shows nothing and throws nothing', async () => {
    vi.mocked(getAnnouncement).mockResolvedValue({ ok: true, data: {} } as unknown as Awaited<ReturnType<typeof getAnnouncement>>);
    const first = open();
    await vi.waitFor(() => expect(getAnnouncement).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(first.container.textContent).toBe('');
    cleanup();
    vi.mocked(getAnnouncement).mockRejectedValue(new Error('boom'));
    const second = open();
    await vi.waitFor(() => expect(getAnnouncement).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(second.container.textContent).toBe('');
  });

  it('a link that is not https or a site path is not rendered, the text still is', async () => {
    serve({ ...base, url: 'javascript:alert(1)' });
    open();
    expect(await screen.findByText(base.text)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Детальніше')).toBeNull();
  });

  it('a failed request shows nothing and no error', async () => {
    vi.mocked(getAnnouncement).mockResolvedValue({ ok: false, error: 'offline' });
    const { container } = open();
    await vi.waitFor(() => expect(getAnnouncement).toHaveBeenCalled());
    await act(async () => {});
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
