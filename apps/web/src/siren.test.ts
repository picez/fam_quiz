// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Siren = typeof import('./siren');
type Fn = ReturnType<typeof vi.fn>;

interface FakeOscillator {
  type: string;
  frequency: { setValueAtTime: Fn; linearRampToValueAtTime: Fn };
  connect: Fn;
  disconnect: Fn;
  start: Fn;
  stop: Fn;
}
interface FakeGain {
  gain: { value: number; setValueAtTime: Fn; linearRampToValueAtTime: Fn };
  connect: Fn;
  disconnect: Fn;
}

let oscillators: FakeOscillator[];
let contexts: FakeAudioContext[];
let state: string;
/** Порядок викликів: resume має йти раніше за розклад сирени. */
let calls: string[];

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state = state;
  resume = vi.fn(async () => {
    calls.push('resume');
  });
  close = vi.fn(async () => undefined);
  gains: FakeGain[] = [];
  sources: { buffer: unknown; connect: Fn; disconnect: Fn; start: Fn; onended: (() => void) | null }[] = [];
  createBuffer = vi.fn((channels: number, length: number, rate: number) => ({ channels, length, rate }));
  constructor() {
    contexts.push(this);
  }
  createOscillator() {
    calls.push('oscillator');
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
    const gain: FakeGain = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = { buffer: null as unknown, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), onended: null as (() => void) | null };
    this.sources.push(source);
    return source;
  }
}

let siren: Siren;

beforeEach(async () => {
  vi.useFakeTimers();
  oscillators = [];
  contexts = [];
  calls = [];
  state = 'running';
  vi.stubGlobal('AudioContext', FakeAudioContext);
  // Спільний контекст живе в модулі: кожен тест — свіжий модуль.
  vi.resetModules();
  siren = await import('./siren');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'audioSession');
});

describe('playSiren', () => {
  it('sweeps one sawtooth between 600 and 1200 Hz for the whole alarm, then stops', () => {
    siren.playSiren(2500);
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
    expect(oscillator!.start).toHaveBeenCalledWith(0);
    expect(oscillator!.stop).toHaveBeenCalledWith(2.5);
  });

  it('the volume rises to 0.2 over 0.02 s and falls to 0 at the end', () => {
    siren.playSiren(2500);
    const gain = contexts[0]!.gains[0]!.gain;
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.2, 0.02);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 2.5);
  });

  it('without a shared context it uses its own and closes it after the alarm', () => {
    siren.playSiren(2500);
    expect(contexts[0]!.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    expect(oscillators[0]!.disconnect).toHaveBeenCalled();
    expect(contexts[0]!.gains[0]!.disconnect).toHaveBeenCalled();
  });

  it('the returned function stops the sound early and cleans up once', () => {
    const stop = siren.playSiren(2500);
    stop();
    expect(oscillators[0]!.stop).toHaveBeenCalledTimes(2);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(3000);
    expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('a suspended context is resumed before the sweep', () => {
    state = 'suspended';
    siren.playSiren(2500);
    expect(contexts[0]!.resume).toHaveBeenCalled();
    expect(calls.indexOf('resume')).toBeLessThan(calls.indexOf('oscillator'));
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
    const stop = siren.playSiren(2500);
    stop();
    await vi.runAllTimersAsync();
    expect(oscillators).toHaveLength(1);
  });

  it('falls back to webkitAudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    siren.playSiren(2500);
    expect(oscillators).toHaveLength(1);
  });

  it('without Web Audio there is silence and no error', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(() => siren.unlockSiren()).not.toThrow();
    const stop = siren.playSiren(2500);
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    expect(siren.sirenReady()).toBe(false);
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
    expect(() => siren.unlockSiren()).not.toThrow();
    expect(() => siren.playSiren(2500)()).not.toThrow();
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        override createOscillator(): FakeOscillator {
          throw new Error('no nodes');
        }
      },
    );
    expect(() => siren.playSiren(2500)()).not.toThrow();
    expect(contexts.at(-1)!.close).toHaveBeenCalled();
  });
});

describe('unlockSiren (12e, iOS)', () => {
  it('in a gesture: creates the shared context, resumes it once and plays one silent sample', () => {
    state = 'suspended';
    siren.unlockSiren();
    expect(contexts).toHaveLength(1);
    const ctx = contexts[0]!;
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 1, 22050);
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.connect).toHaveBeenCalledWith(ctx.destination);
    expect(ctx.sources[0]!.start).toHaveBeenCalledWith(0);
    ctx.sources[0]!.onended?.();
    expect(ctx.sources[0]!.disconnect).toHaveBeenCalled();
  });

  it('a running shared context is not resumed again; sirenReady tells it is running', () => {
    siren.unlockSiren();
    siren.unlockSiren();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.resume).not.toHaveBeenCalled();
    expect(siren.sirenReady()).toBe(true);
  });

  it('every siren after the unlock reuses the shared context and never closes it', () => {
    siren.unlockSiren();
    siren.playSiren(2500);
    vi.advanceTimersByTime(2500);
    siren.playSiren(2500)();
    expect(contexts).toHaveLength(1);
    expect(oscillators).toHaveLength(2);
    expect(contexts[0]!.close).not.toHaveBeenCalled();
    expect(oscillators[0]!.disconnect).toHaveBeenCalled();
    expect(oscillators[1]!.disconnect).toHaveBeenCalled();
  });

  it('a shared context suspended again (after the background) is resumed before the next sweep', () => {
    siren.unlockSiren();
    contexts[0]!.state = 'interrupted';
    siren.playSiren(2500);
    expect(contexts[0]!.resume).toHaveBeenCalledTimes(1);
    expect(calls.indexOf('resume')).toBeLessThan(calls.indexOf('oscillator'));
  });

  it('asks Safari to play the siren as playback when audioSession exists, and skips it safely when not', () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    siren.unlockSiren();
    expect(session.type).toBe('playback');
    Reflect.deleteProperty(navigator, 'audioSession');
    expect(() => siren.playSiren(2500)).not.toThrow();
  });
});
