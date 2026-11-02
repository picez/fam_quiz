// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAudio as Clip } from '@quiz/shared';
import { QuestionAudio } from './QuestionAudio';
import { YOUTUBE_ORIGIN } from './YouTubePlayer';

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

  it('plays only the rest of the clip when the question is already under way', async () => {
    mount({ elapsedMs: 4000 });
    await flush();
    expect(document.querySelector('audio')?.currentTime).toBe(16);
    act(() => void vi.advanceTimersByTime(5900));
    expect(card().dataset.state).toBe('playing');
    act(() => void vi.advanceTimersByTime(200));
    expect(card().dataset.state).toBe('stopped');
  });

  it('a touch after a blocked autostart resumes from the current question time', async () => {
    let elapsed = 0;
    play.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })));
    mount({ elapsedMs: () => elapsed });
    await flush();
    expect(card().dataset.state).toBe('blocked');
    elapsed = 6000;
    fireEvent.click(screen.getByRole('button', { name: '🔊 Увімкнути звук' }));
    await flush();
    expect(document.querySelector('audio')?.currentTime).toBe(18);
    act(() => void vi.advanceTimersByTime(3900));
    expect(card().dataset.state).toBe('playing');
    act(() => void vi.advanceTimersByTime(200));
    expect(card().dataset.state).toBe('stopped');
  });

  it('a stop during the splash keeps the autostart away', async () => {
    const view = mount({ ready: false, splash: true });
    view.again({ command: { action: 'stop', seq: 1 } });
    view.again({ ready: true, splash: false, command: { action: 'stop', seq: 1 } });
    await flush();
    expect(play).not.toHaveBeenCalled();
  });

  it('does not start a clip that has already finished', async () => {
    mount({ elapsedMs: 10_000 });
    await flush();
    expect(play).not.toHaveBeenCalled();
    expect(card().dataset.state).toBe('stopped');
    expect(card().className).toContain('is-quiet');
  });

  it('ignores replay during a splash and asks for a touch on a never-touched page', async () => {
    const view = mount();
    await flush();
    view.again({ splash: true, command: { action: 'replay', seq: 1 } });
    await flush();
    expect(card().dataset.plays).toBe('1');
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: false }, configurable: true });
    try {
      view.again({ splash: false, command: { action: 'replay', seq: 2 } });
      await flush();
      expect(card().dataset.state).toBe('blocked');
    } finally {
      delete (navigator as unknown as { userActivation?: unknown }).userActivation;
    }
  });
});

describe('QuestionAudio on YouTube', () => {
  const frame = () => document.querySelector('iframe') as HTMLIFrameElement;
  const reply = (data: object, origin = YOUTUBE_ORIGIN) =>
    act(() => void window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data), origin, source: frame().contentWindow })));
  const funcs = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.flatMap(([message]) => {
      const data = JSON.parse(String(message)) as { func?: string };
      return data.func === undefined ? [] : [data.func];
    });

  it('is a hidden frame; commands wait for the player to answer, then flush in order', async () => {
    const view = mount({ clip: tube, ready: false });
    expect(frame().src).toContain('youtube-nocookie.com/embed/fJ9rUzIMcZQ');
    expect(frame().getAttribute('aria-hidden')).toBe('true');
    const spy = vi.spyOn(frame().contentWindow as Window, 'postMessage');
    view.again({ ready: true });
    await flush();
    expect(funcs(spy)).not.toContain('playVideo');
    fireEvent.load(frame());
    act(() => void vi.advanceTimersByTime(500));
    expect(spy.mock.calls.some(([message]) => String(message).includes('listening'))).toBe(true);
    expect(funcs(spy)).not.toContain('playVideo');
    reply({ event: 'initialDelivery' }, 'https://evil.example');
    expect(funcs(spy)).not.toContain('playVideo');
    reply({ event: 'initialDelivery' });
    expect(funcs(spy).filter((func) => func === 'seekTo' || func === 'playVideo')).toEqual(['seekTo', 'playVideo']);
    const polls = spy.mock.calls.length;
    act(() => void vi.advanceTimersByTime(1000));
    expect(spy.mock.calls.length).toBe(polls);
  });

  it('turns to blocked when the player does not start in time, and stays playing when it does', async () => {
    mount({ clip: tube });
    fireEvent.load(frame());
    reply({ event: 'initialDelivery' });
    act(() => void vi.advanceTimersByTime(1900));
    reply({ event: 'onStateChange', info: 1 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(card().dataset.state).toBe('playing');
    cleanup();
    mount({ clip: tube });
    fireEvent.load(frame());
    reply({ event: 'initialDelivery' });
    act(() => void vi.advanceTimersByTime(2100));
    expect(card().dataset.state).toBe('blocked');
    expect(screen.getByRole('button', { name: '🔊 Увімкнути звук' })).toBeTruthy();
  });

  it('buffering counts as alive, and a replay while playing does not end as blocked', async () => {
    const view = mount({ clip: tube });
    fireEvent.load(frame());
    reply({ event: 'initialDelivery' });
    reply({ event: 'onStateChange', info: 3 });
    act(() => void vi.advanceTimersByTime(2500));
    expect(card().dataset.state).toBe('playing');
    reply({ event: 'infoDelivery', info: { playerState: 1 } });
    view.again({ command: { action: 'replay', seq: 1 } });
    await flush();
    act(() => void vi.advanceTimersByTime(2500));
    expect(card().dataset.state).toBe('playing');
    expect(card().dataset.plays).toBe('2');
  });

  it('gives up with failed when the player never answers', async () => {
    mount({ clip: tube });
    fireEvent.load(frame());
    act(() => void vi.advanceTimersByTime(10_500));
    expect(card().dataset.state).toBe('failed');
  });

  it('reports a player error and a finished video', async () => {
    mount({ clip: tube });
    fireEvent.load(frame());
    reply({ event: 'onStateChange', info: 1 });
    reply({ event: 'onStateChange', info: 0 });
    expect(card().dataset.state).toBe('stopped');
    cleanup();
    mount({ clip: tube });
    fireEvent.load(frame());
    reply({ event: 'onError', info: 150 });
    expect(card().dataset.state).toBe('failed');
  });
});

describe('QuestionAudio «Прослухати» on the phone (16b)', () => {
  const button = () => document.querySelector('.audio-toggle') as HTMLButtonElement;

  it('without autoplay it stays silent until the tap, then plays from the clip start and the tap again stops it', async () => {
    mount({ autoplay: false, listen: 'first' });
    await flush();
    expect(play).not.toHaveBeenCalled();
    expect(card().dataset.state).toBe('idle');
    expect(button().textContent).toBe('🔊 Прослухати');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button());
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector('audio')?.currentTime).toBe(12);
    expect(card().dataset.state).toBe('playing');
    expect(button().textContent).toBe('⏹ Зупинити');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button());
    expect(pause).toHaveBeenCalled();
    expect(card().dataset.state).toBe('stopped');
    expect(button().textContent).toBe('🔊 Прослухати');
  });

  it('a tap plays the whole clip from its start even late in the question, and stops after the duration', async () => {
    mount({ autoplay: false, listen: 'first', elapsedMs: 7000 });
    fireEvent.click(button());
    await flush();
    expect(document.querySelector('audio')?.currentTime).toBe(12);
    act(() => void vi.advanceTimersByTime(9_900));
    expect(card().dataset.state).toBe('playing');
    act(() => void vi.advanceTimersByTime(200));
    expect(card().dataset.state).toBe('stopped');
    expect(button().textContent).toBe('🔊 Прослухати');
  });

  it('a tapped clip stops when the question ends (live goes false); the reveal offers «Прослухати ще раз»', async () => {
    const view = mount({ autoplay: false, listen: 'first', live: true });
    fireEvent.click(button());
    await flush();
    expect(card().dataset.state).toBe('playing');
    view.again({ autoplay: false, listen: 'again', live: false, ready: false });
    expect(card().dataset.state).toBe('stopped');
    expect(pause).toHaveBeenCalled();
    expect(button().textContent).toBe('🔊 Прослухати ще раз');
    fireEvent.click(button());
    await flush();
    expect(card().dataset.state).toBe('playing');
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('the button keeps one place and size: the card never collapses to quiet', async () => {
    mount({ autoplay: false, listen: 'first' });
    expect(card().classList.contains('is-quiet')).toBe(false);
    expect(card().classList.contains('has-toggle')).toBe(true);
  });

  it('is disabled under the question splash', async () => {
    const view = mount({ autoplay: false, listen: 'first', splash: true, ready: false });
    expect(button().disabled).toBe(true);
    view.again({ autoplay: false, listen: 'first', splash: false, ready: true });
    expect(button().disabled).toBe(false);
  });

  it('with autoplay the button stops the running clip and a new tap replays it from the start', async () => {
    mount({ listen: 'first', elapsedMs: 4000 });
    await flush();
    expect(card().dataset.state).toBe('playing');
    expect(document.querySelector('audio')?.currentTime).toBe(16);
    fireEvent.click(button());
    expect(card().dataset.state).toBe('stopped');
    fireEvent.click(button());
    await flush();
    expect(document.querySelector('audio')?.currentTime).toBe(12);
    expect(card().dataset.state).toBe('playing');
  });

  it('autoplay switched off mid-clip (a stage opened) stops the auto-started clip; a tapped one goes on', async () => {
    const view = mount({ listen: 'first' });
    await flush();
    expect(card().dataset.state).toBe('playing');
    view.again({ listen: 'first', autoplay: false });
    expect(card().dataset.state).toBe('stopped');
    fireEvent.click(button());
    await flush();
    expect(card().dataset.state).toBe('playing');
    view.again({ listen: 'first', autoplay: false, paused: false });
    expect(card().dataset.state).toBe('playing');
  });

  it('autoplay switched on later (the stage left) starts with the rest of the clip, unless a tap already plays it', async () => {
    const view = mount({ autoplay: false, listen: 'first', elapsedMs: 3000 });
    await flush();
    expect(play).not.toHaveBeenCalled();
    view.again({ autoplay: true, listen: 'first', elapsedMs: 3000 });
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector('audio')?.currentTime).toBe(15);
    cleanup();
    play.mockClear();
    const tapped = mount({ autoplay: false, listen: 'first', elapsedMs: 3000 });
    fireEvent.click(button());
    await flush();
    tapped.again({ autoplay: true, listen: 'first', elapsedMs: 3000 });
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
    expect(document.querySelector('audio')?.currentTime).toBe(12);
  });

  it('a blocked tap shows the button again with the screen-reader note', async () => {
    play.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    mount({ autoplay: false, listen: 'first' });
    fireEvent.click(button());
    await flush();
    expect(card().dataset.state).toBe('blocked');
    expect(button().textContent).toBe('🔊 Прослухати');
    expect(screen.queryByRole('button', { name: '🔊 Увімкнути звук' })).toBeNull();
    expect(document.querySelector('.audio-card [role="status"]')?.textContent).toBe('Браузер не дав увімкнути звук — торкніться кнопки.');
  });

  it('a blocked autostart offers «Увімкнути звук»; once a stage opens that turns back into a plain «Прослухати»', async () => {
    play.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    const view = mount({ listen: 'first' });
    await flush();
    expect(card().dataset.state).toBe('blocked');
    expect(screen.getByRole('button', { name: '🔊 Увімкнути звук' })).toBeTruthy();
    expect(document.querySelector('.audio-toggle')).toBeNull();
    view.again({ listen: 'first', autoplay: false });
    expect(card().dataset.state).toBe('idle');
    expect(screen.queryByRole('button', { name: '🔊 Увімкнути звук' })).toBeNull();
    expect(button().textContent).toBe('🔊 Прослухати');
  });

  it('without listen there is no toggle (the stage and the host keep their own controls)', async () => {
    mount();
    await flush();
    expect(document.querySelector('.audio-toggle')).toBeNull();
  });

  it('YouTube: the tap seeks to the clip start and plays inside the hidden frame', async () => {
    mount({ clip: tube, autoplay: false, listen: 'first' });
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    const spy = vi.spyOn(frame.contentWindow as Window, 'postMessage');
    fireEvent.load(frame);
    act(() => void window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'initialDelivery' }), origin: YOUTUBE_ORIGIN, source: frame.contentWindow })));
    const commands = () =>
      spy.mock.calls.flatMap(([message]) => {
        const data = JSON.parse(String(message)) as { func?: string; args?: unknown[] };
        return data.func === 'seekTo' || data.func === 'playVideo' || data.func === 'pauseVideo' ? [[data.func, data.args]] : [];
      });
    expect(commands()).toEqual([]);
    fireEvent.click(button());
    await flush();
    expect(commands()).toEqual([
      ['seekTo', [30, true]],
      ['playVideo', []],
    ]);
    fireEvent.click(button());
    expect(commands().at(-1)?.[0]).toBe('pauseVideo');
  });
});
