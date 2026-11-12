// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MelodyTrack } from '@quiz/shared';
import { YOUTUBE_ORIGIN } from '../screens/YouTubePlayer';
import { useMelodyClip } from './useMelodyClip';

const file: MelodyTrack = { source: 'file', url: '/uploads/abcdef0123456789.mp3', start: 5 };
const tube: MelodyTrack = { source: 'youtube', id: 'fJ9rUzIMcZQ', start: 12 };

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let last: ReturnType<typeof useMelodyClip>;

function Harness({ track = file, paused = false, live = true, seconds = 1 }: { track?: MelodyTrack; paused?: boolean; live?: boolean; seconds?: number }) {
  const clip = useMelodyClip(track, { paused, live });
  last = clip;
  return (
    <>
      {clip.element}
      <button type="button" onClick={() => clip.play(seconds)}>
        go
      </button>
      <output data-testid="state">{`${clip.state}:${clip.playing}`}</output>
    </>
  );
}

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

const audio = () => document.querySelector('audio') as HTMLAudioElement;
const readout = () => screen.getByTestId('state').textContent;
const flush = () => act(async () => {});

describe('useMelodyClip', () => {
  it('plays inside the tap', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go'));
    // Без await і без ефектів: iOS пускає звук лише з того самого жесту.
    expect(play).toHaveBeenCalledTimes(1);
    expect(audio().currentTime).toBe(5);
    expect(audio().getAttribute('preload')).toBe('auto');
  });

  it('stops after the chunk from the moment it plays', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go'));
    await flush();
    act(() => void vi.advanceTimersByTime(300));
    expect(pause).not.toHaveBeenCalled();
    expect(readout()).toBe('playing:1');
    fireEvent.playing(audio());
    act(() => void vi.advanceTimersByTime(999));
    expect(pause).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(pause).toHaveBeenCalled();
    expect(readout()).toBe('idle:null');
  });

  it('a longer chunk restarts from the start', async () => {
    const view = render(<Harness seconds={1} />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.playing(audio());
    audio().currentTime = 5.8;
    view.rerender(<Harness seconds={4} />);
    fireEvent.click(screen.getByText('go'));
    await flush();
    expect(audio().currentTime).toBe(5);
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.playing(audio());
    act(() => void vi.advanceTimersByTime(3999));
    expect(readout()).toBe('playing:4');
    act(() => void vi.advanceTimersByTime(1));
    expect(readout()).toBe('idle:null');
  });

  it('the time update is a second safety stop', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go'));
    await flush();
    audio().currentTime = 5.5;
    fireEvent.timeUpdate(audio());
    expect(readout()).toBe('playing:1');
    audio().currentTime = 6;
    fireEvent.timeUpdate(audio());
    expect(readout()).toBe('idle:null');
  });

  it('pause and the end of the question stop the sound', async () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.playing(audio());
    await flush();
    pause.mockClear();
    view.rerender(<Harness paused />);
    expect(pause).toHaveBeenCalled();
    expect(readout()).toBe('idle:null');
    view.rerender(<Harness />);
    fireEvent.click(screen.getByText('go'));
    await flush();
    expect(readout()).toBe('playing:1');
    pause.mockClear();
    view.rerender(<Harness live={false} />);
    expect(pause).toHaveBeenCalled();
    expect(readout()).toBe('idle:null');
  });

  it('ignores a tap while paused', () => {
    render(<Harness paused />);
    fireEvent.click(screen.getByText('go'));
    expect(play).not.toHaveBeenCalled();
  });

  it('a blocked play is reported', async () => {
    play.mockImplementation(() => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })));
    render(<Harness />);
    fireEvent.click(screen.getByText('go'));
    await flush();
    expect(readout()).toBe('blocked:null');
  });

  it('a media error is reported as failed, and unmounting stops the sound', async () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByText('go'));
    fireEvent.error(audio());
    expect(readout()).toBe('failed:null');
    fireEvent.click(screen.getByText('go'));
    await flush();
    pause.mockClear();
    view.unmount();
    expect(pause).toHaveBeenCalled();
  });

  describe('on YouTube', () => {
    const frame = () => document.querySelector('iframe') as HTMLIFrameElement;
    const reply = (data: object) => act(() => void window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data), origin: YOUTUBE_ORIGIN, source: frame().contentWindow })));
    const commands = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.flatMap(([message]) => {
        const data = JSON.parse(String(message)) as { func?: string; args?: unknown[] };
        return data.func === 'seekTo' || data.func === 'playVideo' || data.func === 'pauseVideo' ? [[data.func, data.args]] : [];
      });

    it('gets seek and play in the tap', () => {
      render(<Harness track={tube} seconds={2} />);
      expect(frame().src).toContain('youtube-nocookie.com/embed/fJ9rUzIMcZQ');
      expect(frame().src).toContain('controls=0');
      const spy = vi.spyOn(frame().contentWindow as Window, 'postMessage');
      fireEvent.load(frame());
      reply({ event: 'initialDelivery' });
      spy.mockClear();
      fireEvent.click(screen.getByText('go'));
      expect(commands(spy)).toEqual([
        ['seekTo', [12, true]],
        ['playVideo', []],
      ]);
    });

    it('stops after the chunk from the moment the player says it plays, and blocks when it never does', () => {
      render(<Harness track={tube} seconds={2} />);
      const spy = vi.spyOn(frame().contentWindow as Window, 'postMessage');
      fireEvent.load(frame());
      reply({ event: 'initialDelivery' });
      fireEvent.click(screen.getByText('go'));
      act(() => void vi.advanceTimersByTime(1500));
      reply({ event: 'onStateChange', info: 3 });
      reply({ event: 'onStateChange', info: 1 });
      act(() => void vi.advanceTimersByTime(1999));
      expect(readout()).toBe('playing:2');
      act(() => void vi.advanceTimersByTime(1));
      expect(readout()).toBe('idle:null');
      expect(commands(spy).at(-1)?.[0]).toBe('pauseVideo');
      fireEvent.click(screen.getByText('go'));
      act(() => void vi.advanceTimersByTime(2100));
      expect(readout()).toBe('blocked:null');
    });

    it('a second chunk while the video plays keeps counting', () => {
      render(<Harness track={tube} seconds={1} />);
      fireEvent.load(frame());
      reply({ event: 'initialDelivery' });
      fireEvent.click(screen.getByText('go'));
      reply({ event: 'onStateChange', info: 1 });
      fireEvent.click(screen.getByText('go'));
      act(() => void vi.advanceTimersByTime(1000));
      expect(readout()).toBe('idle:null');
    });
  });
});
