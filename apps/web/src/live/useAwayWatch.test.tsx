// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '@quiz/shared';
import type { Send } from './types';
import type { Status } from './useGame';
import { AWAY_ACK_MS, blurIsAway, useAwayWatch } from './useAwayWatch';

let visibility: 'visible' | 'hidden' = 'visible';
let focused = true;

const player = (phase: string): GameView => ({ role: 'player', phase }) as unknown as GameView;
const Q = player('question');

const hide = () => {
  visibility = 'hidden';
  focused = false;
  document.dispatchEvent(new Event('visibilitychange'));
};
const show = () => {
  visibility = 'visible';
  focused = true;
  document.dispatchEvent(new Event('visibilitychange'));
};
const blur = () => {
  focused = false;
  window.dispatchEvent(new Event('blur'));
};
const focus = () => {
  focused = true;
  window.dispatchEvent(new Event('focus'));
};
const flush = () => act(async () => {});
const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const run = (fn: () => void) => act(async () => fn());

let send: ReturnType<typeof vi.fn<Send>>;

function watch(status: Status = 'live', view: GameView | null = Q) {
  return renderHook(({ s, v }) => useAwayWatch(send, s, v), { initialProps: { s: status, v: view } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  visibility = 'visible';
  focused = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  send = vi.fn<Send>().mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('blurIsAway', () => {
  it('is a leave only without focus (a focused game iframe keeps the page focused)', () => {
    expect(blurIsAway(false)).toBe(true);
    expect(blurIsAway(true)).toBe(false);
  });
});

describe('useAwayWatch', () => {
  it('says the page is hidden and then how long it was away', async () => {
    watch();
    await run(hide);
    expect(send).toHaveBeenCalledWith('player:away', { away: true });
    await wait(4000);
    await run(show);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 4000 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('counts a blur as a leave only after the grace without focus, from the moment of the blur', async () => {
    watch();
    await run(blur);
    await wait(299);
    expect(send).not.toHaveBeenCalled();
    await wait(1);
    expect(send).toHaveBeenCalledWith('player:away', { away: true });
    await wait(2500);
    await run(focus);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 2800 });
  });

  it('ignores a blur into a game iframe (the page keeps the focus)', async () => {
    watch();
    await run(() => window.dispatchEvent(new Event('blur')));
    await wait(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores a blur that gets focus back within the grace', async () => {
    watch();
    await run(blur);
    await wait(100);
    await run(focus);
    await wait(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores a blur while already out', async () => {
    watch();
    await run(hide);
    await run(() => window.dispatchEvent(new Event('blur')));
    await wait(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignores focus while the page is hidden', async () => {
    watch();
    await run(hide);
    await run(() => window.dispatchEvent(new Event('focus')));
    expect(send).toHaveBeenCalledTimes(1);
    await wait(1000);
    await run(show);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 1000 });
  });

  it('makes a blur followed by hiding one leave with one return', async () => {
    watch();
    await run(blur);
    await wait(300);
    await run(hide);
    await wait(1700);
    await run(() => {
      show();
      focus();
    });
    expect(send.mock.calls).toEqual([
      ['player:away', { away: true }],
      ['player:away', { away: false, ms: 2000 }],
    ]);
  });

  it('ends a blur leave on the first touch even without a focus event', async () => {
    watch();
    await run(blur);
    await wait(300);
    await wait(700);
    await run(() => document.dispatchEvent(new Event('pointerdown')));
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 1000 });
    // ще один дотик — уже не вихід
    await run(() => document.dispatchEvent(new Event('pointerdown')));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('ends a blur leave on a key press', async () => {
    watch();
    await run(blur);
    await wait(1300);
    await run(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 1300 });
  });

  it('ends a blur leave when polling finds the focus back', async () => {
    watch();
    await run(blur);
    await wait(300);
    await wait(1000);
    expect(send).toHaveBeenCalledTimes(1);
    focused = true;
    await wait(500);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 1800 });
    await wait(5000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a touch does not end a leave that came from hiding the page', async () => {
    watch();
    await run(hide);
    await run(() => document.dispatchEvent(new Event('pointerdown')));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps the return report while offline and sends it on reconnect with the time since the return', async () => {
    const hook = watch();
    await run(hide);
    await wait(1000);
    hook.rerender({ s: 'offline', v: Q });
    await wait(3000);
    await run(show);
    expect(send).toHaveBeenCalledTimes(1);
    await wait(2000);
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 4000, sinceReturnMs: 2000 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('two leaves while offline report only the time away, not the visible time between', async () => {
    const hook = watch('offline');
    await run(hide);
    await wait(1000);
    await run(show);
    await wait(10_000);
    await run(hide);
    await wait(2000);
    await run(show);
    await wait(500);
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send.mock.calls).toEqual([['player:away', { away: false, ms: 3000, sinceReturnMs: 500 }]]);
  });

  it('keeps the report when the send itself finds the socket offline', async () => {
    const hook = watch();
    await run(hide);
    await wait(3000);
    send.mockResolvedValueOnce({ ok: false, error: 'offline' });
    await run(show);
    hook.rerender({ s: 'offline', v: Q });
    await wait(500);
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 3000, sinceReturnMs: 500 });
  });

  it('a lost ack does not stop the watch: the report goes out after the reconnect', async () => {
    const hook = watch();
    await run(hide);
    await wait(2000);
    send.mockReturnValueOnce(new Promise(() => {}));
    await run(show);
    expect(send).toHaveBeenCalledTimes(2);
    hook.rerender({ s: 'offline', v: Q });
    await wait(1000);
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 2000, sinceReturnMs: 1000 });
    // і далі все працює
    await run(hide);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: true });
  });

  it('a lost ack times out so a later reconnect still resends', async () => {
    const hook = watch();
    send.mockReturnValueOnce(new Promise(() => {}));
    await run(hide);
    await wait(AWAY_ACK_MS);
    hook.rerender({ s: 'offline', v: Q });
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send.mock.calls).toEqual([
      ['player:away', { away: true }],
      ['player:away', { away: true }],
    ]);
  });

  it('says again it is hidden after a reconnect and later reports from the first leave', async () => {
    const hook = watch();
    await run(hide);
    hook.rerender({ s: 'offline', v: Q });
    await wait(2000);
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send.mock.calls).toEqual([
      ['player:away', { away: true }],
      ['player:away', { away: true }],
    ]);
    await wait(1000);
    await run(show);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 3000 });
  });

  it('a return while the leave is still in flight sends both, in order', async () => {
    watch();
    let deliver: (value: { ok: true }) => void = () => {};
    send.mockReturnValueOnce(new Promise((resolve) => (deliver = resolve)));
    await run(hide);
    await wait(1500);
    await run(show);
    expect(send).toHaveBeenCalledTimes(1);
    await run(() => deliver({ ok: true }));
    expect(send.mock.calls).toEqual([
      ['player:away', { away: true }],
      ['player:away', { away: false, ms: 1500 }],
    ]);
  });

  it('retries the latest report later when the server says too_soon', async () => {
    watch();
    await run(hide);
    await wait(1000);
    send.mockResolvedValueOnce({ ok: false, error: 'too_soon' });
    await run(show);
    expect(send).toHaveBeenCalledTimes(2);
    await wait(1000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 1000, sinceReturnMs: 1000 });
    await wait(5000);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not resend a delivered report on the next reconnect', async () => {
    const hook = watch();
    await run(hide);
    await wait(1000);
    await run(show);
    hook.rerender({ s: 'offline', v: Q });
    hook.rerender({ s: 'live', v: Q });
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps the reported time', async () => {
    watch();
    await run(hide);
    await wait(3_600_000 + 5000);
    await run(show);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 3_600_000 });
  });

  it('reports a page already hidden when the game moves out of the lobby, once', async () => {
    const hook = watch('live', player('lobby'));
    await run(hide);
    expect(send).not.toHaveBeenCalled();
    hook.rerender({ s: 'live', v: player('intro') });
    await flush();
    expect(send.mock.calls).toEqual([['player:away', { away: true }]]);
  });

  it.each([
    ['stage', { role: 'stage', phase: 'question' }],
    ['host', { role: 'host', phase: 'question' }],
    ['lobby', { role: 'player', phase: 'lobby' }],
    ['finished', { role: 'player', phase: 'finished' }],
    ['no view', null],
  ])('stays silent for %s', async (_name, view) => {
    watch('live', view as GameView | null);
    await run(hide);
    await wait(3000);
    await run(show);
    await run(blur);
    await wait(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', async () => {
    const hook = watch();
    hook.unmount();
    await run(hide);
    expect(send).not.toHaveBeenCalled();
  });

  it('a blur check pending at unmount sends nothing', async () => {
    const hook = watch();
    await run(blur);
    hook.unmount();
    await wait(300);
    expect(send).not.toHaveBeenCalled();
  });

  it('a too_soon retry pending at unmount is cleared', async () => {
    const hook = watch();
    send.mockResolvedValueOnce({ ok: false, error: 'too_soon' });
    await run(hide);
    expect(send).toHaveBeenCalledTimes(1);
    hook.unmount();
    await wait(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
