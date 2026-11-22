// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startEditorTime } from './editor-time';

type Body = { seconds: number; start: boolean };
let visibility: DocumentVisibilityState = 'visible';
let stop: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

function start(result: () => boolean = () => true) {
  const sent: { body: Body; keepalive: boolean }[] = [];
  const send = vi.fn(async (body: Body, keepalive: boolean) => {
    sent.push({ body: { ...body }, keepalive });
    return result();
  });
  stop = startEditorTime(send);
  return { sent, send };
}
const act = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
/** sec секунд з дією кожні every секунд (0 — без дій). */
async function pass(sec: number, every = 0) {
  for (let t = 0; t < sec; t += 5) {
    if (every > 0 && t % every === 0) act();
    await vi.advanceTimersByTimeAsync(5_000);
  }
}
const hide = () => {
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('startEditorTime (71)', () => {
  it('sends a minute of work, the first portion starts the session', async () => {
    const { sent } = start();
    act();
    await pass(60, 20);
    expect(sent).toEqual([{ body: { seconds: 60, start: true }, keepalive: false }]);
    await pass(60, 20);
    expect(sent.map((item) => item.body)).toEqual([
      { seconds: 60, start: true },
      { seconds: 60, start: false },
    ]);
  });

  it('counts only a minute after the last action, then nothing', async () => {
    const { sent } = start();
    act();
    await pass(120);
    await pass(120);
    expect(sent.map((item) => item.body)).toEqual([{ seconds: 60, start: true }]);
  });

  it('a hidden tab does not count; hiding sends what was gathered at once', async () => {
    const { sent } = start();
    act();
    await pass(15, 5);
    hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ body: { seconds: 15, start: true }, keepalive: true }]);
    act();
    await pass(60, 5);
    expect(sent).toHaveLength(1);
  });

  it('stopping sends the rest with keepalive; nothing gathered — nothing sent', async () => {
    const first = start();
    act();
    await pass(10, 5);
    stop!();
    stop = null;
    await vi.advanceTimersByTimeAsync(0);
    expect(first.sent).toEqual([{ body: { seconds: 10, start: true }, keepalive: true }]);

    const second = start();
    stop!();
    stop = null;
    await vi.advanceTimersByTimeAsync(0);
    expect(second.send).not.toHaveBeenCalled();
  });

  it('a failed send keeps the seconds for the next portion, at most 600, without doubling', async () => {
    let ok = false;
    const results: boolean[] = [];
    const { sent } = start(() => {
      results.push(ok);
      return ok;
    });
    // 12 хвилин роботи, усе невдало: лишається не більше 600 с; повтор — не частіше раз на хвилину.
    await pass(720, 20);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThanOrEqual(12);
    expect(sent.every((item) => item.body.seconds <= 600 && item.body.start)).toBe(true);
    ok = true;
    await pass(180, 20);
    const delivered = sent.filter((_, index) => results[index]).map((item) => item.body);
    expect(delivered[0]).toEqual({ seconds: 600, start: true });
    expect(delivered.length).toBeGreaterThan(1);
    // Після вдалої порції — нові з нуля: по 60 с, уже не початок сесії.
    expect(delivered.slice(1).every((body) => body.seconds === 60 && !body.start)).toBe(true);
  });

  it('stopping removes the listeners and the timer', async () => {
    const { send } = start();
    stop!();
    stop = null;
    act();
    await pass(120, 5);
    expect(send).not.toHaveBeenCalled();
  });
});
