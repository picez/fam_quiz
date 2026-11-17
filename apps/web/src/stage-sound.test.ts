// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;
interface FakeParam {
  setValueAtTime: Fn;
  linearRampToValueAtTime: Fn;
  exponentialRampToValueAtTime: Fn;
}
interface FakeOscillator {
  type: string;
  frequency: FakeParam;
  connect: Fn;
  disconnect: Fn;
  start: Fn;
  stop: Fn;
  onended: (() => void) | null;
}
interface FakeGain {
  gain: FakeParam;
  connect: Fn;
  disconnect: Fn;
}

let oscillators: FakeOscillator[];
let gains: FakeGain[];
let contexts: FakeAudioContext[];
let state: string;

const param = (): FakeParam => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state = state;
  onstatechange: (() => void) | null = null;
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createBuffer = vi.fn(() => ({}));
  constructor() {
    contexts.push(this);
  }
  createOscillator() {
    const oscillator: FakeOscillator = { type: 'sine', frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain: FakeGain = { gain: param(), connect: vi.fn(), disconnect: vi.fn() };
    gains.push(gain);
    return gain;
  }
  createBufferSource() {
    return { buffer: null as unknown, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), onended: null as (() => void) | null };
  }
}

type Audio = typeof import('./audio');
type Stage = typeof import('./stage-sound');
let audio: Audio;
let stage: Stage;
let heard: string[];
const onSound = (event: Event) => heard.push((event as CustomEvent<string>).detail);

beforeEach(async () => {
  oscillators = [];
  gains = [];
  contexts = [];
  heard = [];
  state = 'running';
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.resetModules();
  audio = await import('./audio');
  stage = await import('./stage-sound');
  window.addEventListener('quiz:stage-sound', onSound);
});

afterEach(() => {
  window.removeEventListener('quiz:stage-sound', onSound);
  vi.unstubAllGlobals();
});

describe('stage sounds', () => {
  it('every sound is short and moderate', () => {
    for (const [sound, notes] of Object.entries(stage.SOUND_NOTES)) {
      const end = Math.max(...notes.map((n) => n.at + n.dur));
      expect(end, sound).toBeLessThanOrEqual(sound === 'fanfare' ? 3 : 1.5);
      for (const n of notes) {
        expect(n.gain, sound).toBeGreaterThan(0);
        expect(n.dur, sound).toBeGreaterThan(0.01);
      }
      for (let step = 0; step <= Math.round(end * 100); step += 1) {
        const t = step / 100;
        const sum = notes.filter((n) => t >= n.at - 1e-9 && t < n.at + n.dur - 1e-9).reduce((acc, n) => acc + n.gain, 0);
        expect(sum, `${sound} at ${t}`).toBeLessThanOrEqual(0.2 + 1e-9);
      }
    }
  });

  it('nothing plays before a gesture', () => {
    expect(stage.playStageSound('correct')).toBe(false);
    expect(contexts).toHaveLength(0);
    expect(heard).toEqual([]);
  });

  it('after a gesture the chord plays once through the shared context', () => {
    audio.unlockAudio();
    expect(stage.playStageSound('correct')).toBe(true);
    expect(oscillators).toHaveLength(stage.SOUND_NOTES.correct.length);
    expect(contexts).toHaveLength(1);
    expect(heard).toEqual(['correct']);
    for (const oscillator of oscillators) {
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
    }
    for (const gain of gains) {
      expect(gain.gain.setValueAtTime.mock.calls[0]?.[0]).toBe(0);
      const ramp = gain.gain.linearRampToValueAtTime.mock.calls[0] as [number, number];
      const start = (gain.gain.setValueAtTime.mock.calls[0] as [number, number])[1];
      expect(ramp[0]).toBeGreaterThan(0);
      expect(ramp[1] - start).toBeGreaterThanOrEqual(0.01 - 1e-9);
    }
  });

  it('a suspended context stays silent and is resumed', () => {
    state = 'suspended';
    audio.unlockAudio();
    const ctx = contexts[0] as FakeAudioContext;
    ctx.resume.mockClear();
    expect(stage.playStageSound('wrong')).toBe(false);
    expect(ctx.resume).toHaveBeenCalled();
    expect(oscillators).toHaveLength(0);
    expect(heard).toEqual([]);
  });

  it('subscribeAudio hears the unlock and a state change', () => {
    const listener = vi.fn();
    const off = audio.subscribeAudio(listener);
    audio.unlockAudio();
    expect(listener).toHaveBeenCalledTimes(1);
    (contexts[0] as FakeAudioContext).onstatechange?.();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    (contexts[0] as FakeAudioContext).onstatechange?.();
    audio.unlockAudio();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('without Web Audio - silence, no error', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.resetModules();
    const bareAudio = await import('./audio');
    const bareStage = await import('./stage-sound');
    expect(bareAudio.audioSupported()).toBe(false);
    expect(() => bareAudio.unlockAudio()).not.toThrow();
    expect(bareStage.playStageSound('gong')).toBe(false);
  });
});
