// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playSiren } from './siren';

interface FakeOscillator {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

let oscillators: FakeOscillator[];
let contexts: { state: string; resume: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; gains: { gain: { value: number }; disconnect: ReturnType<typeof vi.fn> }[] }[];
let state: string;

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state = state;
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  gains: { gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  constructor() {
    contexts.push(this);
  }
  createOscillator() {
    const oscillator: FakeOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain = { gain: { value: 1, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain);
    return gain;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  oscillators = [];
  contexts = [];
  state = 'running';
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('playSiren', () => {
  it('sweeps one sawtooth between 600 and 1200 Hz for the whole alarm, quietly, then stops', () => {
    playSiren(2500);
    expect(oscillators).toHaveLength(1);
    const [oscillator] = oscillators;
    expect(oscillator!.type).toBe('sawtooth');
    expect(oscillator!.frequency.setValueAtTime).toHaveBeenCalledWith(600, 0);
    const ramps = oscillator!.frequency.linearRampToValueAtTime.mock.calls as [number, number][];
    expect(ramps.map(([hz]) => hz)).toContain(1200);
    expect(ramps.map(([hz]) => hz)).toContain(600);
    // Півперіод 0,4 с: 1200 на 0,4, 600 на 0,8, … і ніщо не пізніше за кінець.
    expect(ramps[0]).toEqual([1200, 0.4]);
    expect(ramps[1]![0]).toBe(600);
    expect(Math.max(...ramps.map(([, at]) => at))).toBeLessThanOrEqual(2.5);
    expect(contexts[0]!.gains[0]!.gain.value).toBe(0.2);
    expect(oscillator!.start).toHaveBeenCalledWith(0);
    expect(oscillator!.stop).toHaveBeenCalledWith(2.5);
  });

  it('closes the context after the alarm by itself', () => {
    playSiren(2500);
    expect(contexts[0]!.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    expect(oscillators[0]!.disconnect).toHaveBeenCalled();
    expect(contexts[0]!.gains[0]!.disconnect).toHaveBeenCalled();
  });

  it('the returned function stops the sound early and cleans up once', () => {
    const stop = playSiren(2500);
    stop();
    expect(oscillators[0]!.stop).toHaveBeenCalledTimes(2);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(3000);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended context', () => {
    state = 'suspended';
    playSiren(2500);
    expect(contexts[0]!.resume).toHaveBeenCalled();
  });

  it('a rejected resume or close stays silent', async () => {
    state = 'suspended';
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        override resume = vi.fn(async () => Promise.reject(new Error('not allowed')));
        override close = vi.fn(async () => Promise.reject(new Error('closed')));
      },
    );
    const stop = playSiren(2500);
    stop();
    await vi.runAllTimersAsync();
    expect(oscillators).toHaveLength(1);
  });

  it('falls back to webkitAudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    playSiren(2500);
    expect(oscillators).toHaveLength(1);
  });

  it('without Web Audio there is silence and no error', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const stop = playSiren(2500);
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });

  it('a context that throws on creation or on a node is silent', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    expect(() => playSiren(2500)()).not.toThrow();
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        override createOscillator(): FakeOscillator {
          throw new Error('no nodes');
        }
      },
    );
    expect(() => playSiren(2500)()).not.toThrow();
    expect(contexts.at(-1)!.close).toHaveBeenCalled();
  });
});
