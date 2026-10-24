// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAudio as Clip } from '@quiz/shared';
import { QuestionAudio } from './QuestionAudio';

const file: Clip = { source: 'file', url: '/uploads/abcdef0123456789.mp3', start: 12, duration: 10 };
const tube: Clip = { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 30, duration: 15 };

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const card = () => document.querySelector('.audio-card') as HTMLElement;
const flush = () => act(async () => {});

function mount(over: Partial<Parameters<typeof QuestionAudio>[0]> = {}) {
  const props = { clip: file, questionKey: '0:0', ready: true, paused: false, command: null, ...over };
  const view = render(<QuestionAudio {...props} />);
  return { ...view, again: (next: Partial<typeof props>) => view.rerender(<QuestionAudio {...props} {...next} />) };
}

describe('QuestionAudio', () => {
  it('starts the clip once when ready, from its start second', async () => {
    mount();
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector('audio')?.currentTime).toBe(12);
    expect(card().dataset.state).toBe('playing');
    expect(card().dataset.plays).toBe('1');
    expect(screen.getByText('🎵 Слухайте')).toBeTruthy();
  });

  it('waits until ready', async () => {
    const view = mount({ ready: false });
    await flush();
    expect(play).not.toHaveBeenCalled();
    view.again({ ready: true });
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops after the duration', async () => {
    mount();
    await flush();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(pause).toHaveBeenCalled();
    expect(card().dataset.state).toBe('stopped');
  });

  it('replays and stops on new commands only', async () => {
    const view = mount();
    await flush();
    view.again({ command: { action: 'replay', seq: 1 } });
    await flush();
    expect(card().dataset.plays).toBe('2');
    view.again({ command: { action: 'replay', seq: 1 } });
    await flush();
    expect(card().dataset.plays).toBe('2');
    view.again({ command: { action: 'stop', seq: 2 } });
    expect(card().dataset.state).toBe('stopped');
  });

  it('ignores a command that was already there on mount', async () => {
    mount({ command: { action: 'replay', seq: 7 } });
    await flush();
    expect(card().dataset.plays).toBe('1');
  });

  it('pauses with the game and resumes with the rest of the clip', async () => {
    const view = mount();
    await flush();
    act(() => void vi.advanceTimersByTime(4000));
    view.again({ paused: true });
    expect(pause).toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(card().dataset.state).toBe('playing');
    view.again({ paused: false });
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    act(() => void vi.advanceTimersByTime(5900));
    expect(card().dataset.state).toBe('playing');
    act(() => void vi.advanceTimersByTime(200));
    expect(card().dataset.state).toBe('stopped');
  });

  it('shows the unlock button when the browser blocks play, and a touch plays again', async () => {
    play.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    mount();
    await flush();
    expect(card().dataset.state).toBe('blocked');
    fireEvent.click(screen.getByRole('button', { name: '🔊 Увімкнути звук' }));
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    expect(card().dataset.state).toBe('playing');
  });

  it('asks for a touch up front when the page was never touched', async () => {
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: false }, configurable: true });
    try {
      mount();
      await flush();
      expect(play).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '🔊 Увімкнути звук' })).toBeTruthy();
    } finally {
      delete (navigator as unknown as { userActivation?: unknown }).userActivation;
    }
  });

  it('reports other play errors without throwing', async () => {
    play.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    mount();
    await flush();
    expect(card().dataset.state).toBe('failed');
    expect(screen.getByText('Звук недоступний')).toBeTruthy();
  });

  it('stops everything on unmount and when the question changes', async () => {
    const view = mount();
    await flush();
    pause.mockClear();
    view.again({ questionKey: '0:1', ready: false });
    expect(pause).toHaveBeenCalled();
    pause.mockClear();
    view.unmount();
    expect(pause).toHaveBeenCalled();
  });

  it('drives a hidden YouTube frame by postMessage', async () => {
    mount({ clip: tube, ready: false });
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toContain('youtube-nocookie.com/embed/fJ9rUzIMcZQ');
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    const post = vi.spyOn(frame.contentWindow as Window, 'postMessage');
    cleanup();
    const view = mount({ clip: tube, ready: false });
    const next = document.querySelector('iframe') as HTMLIFrameElement;
    const spy = vi.spyOn(next.contentWindow as Window, 'postMessage');
    view.again({ ready: true });
    await flush();
    const funcs = spy.mock.calls.map(([message]) => (JSON.parse(String(message)) as { func: string }).func);
    expect(funcs).toEqual(expect.arrayContaining(['seekTo', 'playVideo']));
    void post;
  });
});
