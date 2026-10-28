// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '@quiz/shared';
import type { Send } from './types';
import type { Status } from './useGame';
import { blurIsAway, useAwayWatch } from './useAwayWatch';

let visibility: 'visible' | 'hidden' = 'visible';
let focused = true;
let activeTag: string | null = 'BODY';

const player = (phase: string): GameView => ({ role: 'player', phase }) as unknown as GameView;

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
const flush = () => act(async () => {});
const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

let send: ReturnType<typeof vi.fn<Send>>;

function watch(status: Status = 'live', view: GameView | null = player('question')) {
  return renderHook(({ s, v }) => useAwayWatch(send, s, v), { initialProps: { s: status, v: view } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  visibility = 'visible';
  focused = true;
  activeTag = 'BODY';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => (activeTag === null ? null : ({ tagName: activeTag } as Element)),
  });
  send = vi.fn<Send>().mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(document, 'activeElement');
});

describe('blurIsAway', () => {
  it('is a leave only without focus and not inside a game iframe', () => {
    expect(blurIsAway(false, 'IFRAME')).toBe(false);
    expect(blurIsAway(false, 'BODY')).toBe(true);
    expect(blurIsAway(false, null)).toBe(true);
    expect(blurIsAway(true, null)).toBe(false);
  });
});

describe('useAwayWatch', () => {
  it('says the page is hidden and then how long it was away', async () => {
    watch();
    await act(async () => hide());
    expect(send).toHaveBeenCalledWith('player:away', { away: true });
    await wait(4000);
    await act(async () => show());
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 4000 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('counts a blur as a leave only after the grace without focus', async () => {
    watch();
    await act(async () => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
    });
    await wait(299);
    expect(send).not.toHaveBeenCalled();
    await wait(1);
    expect(send).toHaveBeenCalledWith('player:away', { away: true });
    await wait(2500);
    await act(async () => {
      focused = true;
      window.dispatchEvent(new Event('focus'));
    });
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 2500 });
  });

  it('ignores a blur into a game iframe', async () => {
    watch();
    await act(async () => {
      focused = false;
      activeTag = 'IFRAME';
      window.dispatchEvent(new Event('blur'));
    });
    await wait(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores a blur that gets focus back within the grace', async () => {
    watch();
    await act(async () => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
    });
    await wait(100);
    await act(async () => {
      focused = true;
      window.dispatchEvent(new Event('focus'));
    });
    await wait(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('makes a blur followed by hiding one leave with one return', async () => {
    watch();
    await act(async () => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
    });
    await wait(300);
    await act(async () => hide());
    await wait(1700);
    await act(async () => {
      show();
      window.dispatchEvent(new Event('focus'));
    });
    expect(send.mock.calls).toEqual([
      ['player:away', { away: true }],
      ['player:away', { away: false, ms: 1700 }],
    ]);
  });

  it('keeps the return report while offline and sends it on reconnect with the time since the return', async () => {
    const hook = watch();
    await act(async () => hide());
    await wait(1000);
    hook.rerender({ s: 'offline', v: player('question') });
    await wait(3000);
    await act(async () => show());
    expect(send).toHaveBeenCalledTimes(1);
    await wait(2000);
    hook.rerender({ s: 'live', v: player('question') });
    await flush();
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 4000, sinceReturnMs: 2000 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the report when the send itself finds the socket offline', async () => {
    const hook = watch();
    await act(async () => hide());
    await wait(3000);
    send.mockResolvedValueOnce({ ok: false, error: 'offline' });
    await act(async () => show());
    hook.rerender({ s: 'offline', v: player('question') });
    await wait(500);
    hook.rerender({ s: 'live', v: player('question') });
    await flush();
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 3000, sinceReturnMs: 500 });
  });

  it('says again it is hidden after a reconnect and later reports from the first leave', async () => {
    const hook = watch();
    await act(async () => hide());
    hook.rerender({ s: 'offline', v: player('question') });
    await wait(2000);
    hook.rerender({ s: 'live', v: player('question') });
    await flush();
    expect(send.mock.calls).toEqual([
      ['player:away', { away: true }],
      ['player:away', { away: true }],
    ]);
    await wait(1000);
    await act(async () => show());
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 3000 });
  });

  it('retries the latest report later when the server says too_soon', async () => {
    watch();
    await act(async () => hide());
    await wait(1000);
    send.mockResolvedValueOnce({ ok: false, error: 'too_soon' });
    await act(async () => show());
    expect(send).toHaveBeenCalledTimes(2);
    await wait(1000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 1000, sinceReturnMs: 1000 });
    await wait(5000);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not resend a delivered report on the next reconnect', async () => {
    const hook = watch();
    await act(async () => hide());
    await wait(1000);
    await act(async () => show());
    hook.rerender({ s: 'offline', v: player('question') });
    hook.rerender({ s: 'live', v: player('question') });
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps the reported time', async () => {
    watch();
    await act(async () => hide());
    await wait(3_600_000 + 5000);
    await act(async () => show());
    expect(send).toHaveBeenLastCalledWith('player:away', { away: false, ms: 3_600_000 });
  });

  it('reports a page already hidden when the game moves out of the lobby', async () => {
    const hook = watch('live', player('lobby'));
    await act(async () => hide());
    expect(send).not.toHaveBeenCalled();
    hook.rerender({ s: 'live', v: player('intro') });
    await flush();
    expect(send).toHaveBeenCalledWith('player:away', { away: true });
  });

  it.each([
    ['stage', { role: 'stage', phase: 'question' }],
    ['host', { role: 'host', phase: 'question' }],
    ['lobby', { role: 'player', phase: 'lobby' }],
    ['finished', { role: 'player', phase: 'finished' }],
    ['no view', null],
  ])('stays silent for %s', async (_name, view) => {
    watch('live', view as GameView | null);
    await act(async () => hide());
    await wait(3000);
    await act(async () => show());
    await act(async () => {
      focused = false;
      window.dispatchEvent(new Event('blur'));
    });
    await wait(1000);
    expect(send).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', async () => {
    const hook = watch();
    hook.unmount();
    await act(async () => hide());
    expect(send).not.toHaveBeenCalled();
  });
});
