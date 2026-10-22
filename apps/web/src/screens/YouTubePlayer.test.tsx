// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YOUTUBE_ORIGIN, YouTubePlayer, youtubeEmbedUrl } from './YouTubePlayer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const video = { id: 'dQw4w9WgXcQ', start: 90 };
const iframe = () => document.querySelector('iframe') as HTMLIFrameElement;
const report = (init: { origin: string; source: MessageEventSource | null }) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: '{"event":"onError","info":150}', ...init }));
  });

describe('YouTubePlayer', () => {
  it('builds a no-cookie embed address with the start and without autoplay', () => {
    const url = youtubeEmbedUrl(video, 'https://quiz.example');
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')).toBe(true);
    expect(url).toContain('start=90');
    expect(url).toContain('enablejsapi=1');
    expect(url).toContain('origin=https%3A%2F%2Fquiz.example');
    expect(url).not.toContain('autoplay');
  });

  it('renders nothing without a video', () => {
    const { container } = render(<YouTubePlayer video={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the player and swaps it for a notice when the player reports an error', () => {
    render(<YouTubePlayer video={video} />);
    expect(screen.getByTitle('Відео до запитання')).toBeTruthy();
    report({ origin: YOUTUBE_ORIGIN, source: iframe().contentWindow });
    expect(screen.getByText('Відео недоступне')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('posts listening and the onError subscription every 250 ms after load until the frame replies', () => {
    vi.useFakeTimers();
    try {
      render(<YouTubePlayer video={video} />);
      const post = vi.spyOn(iframe().contentWindow as Window, 'postMessage');
      fireEvent.load(iframe());
      const sent = () => post.mock.calls.map(([message]) => JSON.parse(String(message)));
      expect(sent()).toEqual([
        { event: 'listening', id: 1, channel: 'widget' },
        { event: 'command', func: 'addEventListener', args: ['onError'], id: 1, channel: 'widget' },
      ]);
      expect(post.mock.calls.every((call) => (call as unknown[])[1] === YOUTUBE_ORIGIN)).toBe(true);
      act(() => void vi.advanceTimersByTime(500));
      expect(post).toHaveBeenCalledTimes(6);
      // чужа відповідь не зупиняє опитування
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: '{"event":"initialDelivery"}', origin: 'https://evil.example', source: iframe().contentWindow }));
      });
      act(() => void vi.advanceTimersByTime(250));
      expect(post).toHaveBeenCalledTimes(8);
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: '{"event":"initialDelivery"}', origin: YOUTUBE_ORIGIN, source: iframe().contentWindow }));
      });
      act(() => void vi.advanceTimersByTime(1000));
      expect(post).toHaveBeenCalledTimes(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling on unmount', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<YouTubePlayer video={video} />);
      const post = vi.spyOn(iframe().contentWindow as Window, 'postMessage');
      fireEvent.load(iframe());
      unmount();
      act(() => void vi.advanceTimersByTime(1000));
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores messages from other origins or frames', () => {
    render(<YouTubePlayer video={video} />);
    report({ origin: 'https://evil.example', source: iframe().contentWindow });
    report({ origin: YOUTUBE_ORIGIN, source: window });
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(screen.queryByText('Відео недоступне')).toBeNull();
  });

  it('shows the notice right away when offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<YouTubePlayer video={video} />);
    expect(screen.getByText('Відео недоступне')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
