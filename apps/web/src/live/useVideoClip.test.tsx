// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '@quiz/shared';
import { YOUTUBE_BLOCK_MS } from '../screens/QuestionAudio';
import { YOUTUBE_ORIGIN } from '../screens/YouTubePlayer';
import { useVideoClip } from './useVideoClip';

const clipOf: Video = { id: 'fJ9rUzIMcZQ', start: 12 };

let last: ReturnType<typeof useVideoClip>;

function Harness({ muted = true, paused = false, live = true, reveal = false, seconds = 1 }: { muted?: boolean; paused?: boolean; live?: boolean; reveal?: boolean; seconds?: number }) {
  const clip = useVideoClip(clipOf, { muted, paused, live, reveal });
  last = clip;
  return (
    <>
      {clip.element}
      <button type="button" onClick={() => clip.play(seconds)}>
        go
      </button>
      <output data-testid="state">{`${clip.state}:${clip.playing}:${clip.covered}`}</output>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const frame = () => document.querySelector('iframe') as HTMLIFrameElement;
const readout = () => screen.getByTestId('state').textContent;
const reply = (data: object) => act(() => void window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data), origin: YOUTUBE_ORIGIN, source: frame().contentWindow })));
const PLAYER = new Set(['seekTo', 'mute', 'unMute', 'playVideo', 'pauseVideo']);
const commands = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.flatMap(([message]) => {
    const data = JSON.parse(String(message)) as { func?: string; args?: unknown[] };
    return data.func !== undefined && PLAYER.has(data.func) ? [[data.func, data.args]] : [];
  });

/** Рамка вже відгукнулась: команди йдуть одразу. */
function ready() {
  const spy = vi.spyOn(frame().contentWindow as Window, 'postMessage');
  fireEvent.load(frame());
  reply({ event: 'initialDelivery' });
  spy.mockClear();
  return spy;
}

describe('useVideoClip', () => {
  it('commands go out inside the tap', () => {
    render(<Harness />);
    const spy = ready();
    fireEvent.click(screen.getByText('go'));
    // Без ефектів між дотиком і командами: iOS пускає відтворення лише з жесту.
    expect(commands(spy)).toEqual([
      ['seekTo', [12, true]],
      ['mute', []],
      ['playVideo', []],
    ]);
  });

  it('with sound the player is unmuted', () => {
    const view = render(<Harness muted={false} />);
    expect(frame().src).not.toContain('mute=1');
    const spy = ready();
    fireEvent.click(screen.getByText('go'));
    expect(commands(spy)).toEqual([
      ['seekTo', [12, true]],
      ['unMute', []],
      ['playVideo', []],
    ]);
    view.unmount();
    render(<Harness muted />);
    expect(frame().src).toContain('mute=1');
  });

  it('the embed hides YouTube extras', () => {
    render(<Harness />);
    const src = frame().src;
    for (const part of ['controls=0', 'rel=0', 'playsinline=1', 'disablekb=1', 'iv_load_policy=3', 'fs=0', 'start=12']) expect(src, part).toContain(part);
    expect(src).not.toContain('autoplay');
    expect(frame().className).toContain('videoclip-iframe');
    expect(frame().tabIndex).toBe(-1);
    expect(frame().closest('.videoclip-frame')).not.toBeNull();
  });

  it('the cover lifts only while a chunk plays', () => {
    render(<Harness />);
    const spy = ready();
    expect(last.covered).toBe(true);
    expect(document.querySelector('.videoclip-cover')).not.toBeNull();
    fireEvent.click(screen.getByText('go'));
    expect(last.covered).toBe(true);
    reply({ event: 'onStateChange', info: 1 });
    expect(last.covered).toBe(false);
    expect(document.querySelector('.videoclip-cover')).toBeNull();
    expect(document.querySelector('.videoclip-mask-top')).not.toBeNull();
    expect(document.querySelector('.videoclip-mask-corner')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1000));
    expect(commands(spy).at(-1)?.[0]).toBe('pauseVideo');
    expect(readout()).toBe('idle:null:true');
    expect(document.querySelector('.videoclip-mask-top')).toBeNull();
  });

  it('the chunk timer starts when the video plays', () => {
    render(<Harness seconds={1} />);
    const spy = ready();
    fireEvent.click(screen.getByText('go'));
    act(() => void vi.advanceTimersByTime(300));
    reply({ event: 'onStateChange', info: 3 });
    expect(commands(spy).some(([func]) => func === 'pauseVideo')).toBe(false);
    reply({ event: 'onStateChange', info: 1 });
    act(() => void vi.advanceTimersByTime(999));
    expect(commands(spy).some(([func]) => func === 'pauseVideo')).toBe(false);
    expect(readout()).toBe('playing:1:false');
    act(() => void vi.advanceTimersByTime(1));
    expect(commands(spy).some(([func]) => func === 'pauseVideo')).toBe(true);
  });

  it('the end of the video covers it', () => {
    render(<Harness seconds={16} />);
    ready();
    fireEvent.click(screen.getByText('go'));
    reply({ event: 'onStateChange', info: 1 });
    expect(last.covered).toBe(false);
    reply({ event: 'onStateChange', info: 0 });
    expect(last.covered).toBe(true);
    expect(last.playing).toBeNull();
  });

  it('a silent player is reported', () => {
    render(<Harness />);
    ready();
    fireEvent.click(screen.getByText('go'));
    act(() => void vi.advanceTimersByTime(YOUTUBE_BLOCK_MS));
    expect(readout()).toBe('blocked:null:true');
    fireEvent.click(screen.getByText('go'));
    reply({ event: 'onError', info: 150 });
    expect(readout()).toBe('failed:null:true');
  });

  it('the reveal falls back to mute', () => {
    render(<Harness reveal muted seconds={30} />);
    expect(frame().src).not.toContain('mute=1');
    const spy = ready();
    fireEvent.click(screen.getByText('go'));
    // На розкритті звук є завжди, навіть для запитання «без звуку».
    expect(commands(spy)).toEqual([
      ['seekTo', [12, true]],
      ['unMute', []],
      ['playVideo', []],
    ]);
    spy.mockClear();
    act(() => void vi.advanceTimersByTime(YOUTUBE_BLOCK_MS));
    expect(commands(spy)).toEqual([
      ['mute', []],
      ['playVideo', []],
    ]);
    expect(last.state).toBe('muted-fallback');
    spy.mockClear();
    act(() => last.unmute());
    expect(commands(spy)).toEqual([['unMute', []]]);
  });

  it('pause and the end of the question stop the video', () => {
    const view = render(<Harness seconds={8} />);
    const spy = ready();
    fireEvent.click(screen.getByText('go'));
    reply({ event: 'onStateChange', info: 1 });
    spy.mockClear();
    view.rerender(<Harness seconds={8} paused />);
    expect(commands(spy)).toEqual([['pauseVideo', []]]);
    expect(readout()).toBe('idle:null:true');
    // На паузі дотик нічого не вмикає.
    spy.mockClear();
    fireEvent.click(screen.getByText('go'));
    expect(commands(spy)).toEqual([]);
    view.rerender(<Harness seconds={8} />);
    fireEvent.click(screen.getByText('go'));
    reply({ event: 'onStateChange', info: 1 });
    spy.mockClear();
    view.rerender(<Harness seconds={8} live={false} />);
    expect(commands(spy)).toEqual([['pauseVideo', []]]);
    expect(last.covered).toBe(true);
  });

  it('duration comes from infoDelivery', () => {
    render(<Harness />);
    ready();
    expect(last.duration).toBeNull();
    reply({ event: 'infoDelivery', info: { duration: 14 } });
    expect(last.duration).toBe(14);
  });
});
