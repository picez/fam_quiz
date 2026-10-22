// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
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
