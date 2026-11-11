// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JIGSAW_HOLD_REFRESH_MS, jigsawTabs, type PlayerJigsaw, type PublicJigsaw } from '@quiz/shared';
import type { Send, SendResult } from './types';
import { JIGSAW_RETRY_MS, jigsawPile, useJigsaw } from './useJigsaw';

const infoOf = (over: Partial<PlayerJigsaw> = {}): PlayerJigsaw => ({ placed: [], held: [], done: false, canPlace: true, seq: 0, timeMs: null, result: null, ...over });
const JIGSAW: PublicJigsaw = { photo: '/uploads/0123456789abcdef0123.jpg', aspect: '4:3', focus: { x: 0.5, y: 0.5 }, rows: 3, cols: 4, tabs: jigsawTabs(3, 4, 1), preview: false };

/** Ack, що відповідає, коли тест скаже. */
function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at](result)) };
}

function mount(send: Send, info = infoOf(), team = false) {
  return renderHook(({ info: now }) => useJigsaw(now, JIGSAW, 0, 'p1', send, team), { initialProps: { info } });
}

type Hook = ReturnType<typeof mount>;
const looseOf = (hook: Hook, piece: number) => hook.result.current.loose.find((item) => item.piece === piece);
/** Повертає шматочок тапами, доки він не стане прямо. */
function upright(hook: Hook, piece: number) {
  for (let i = 0; i < 4 && looseOf(hook, piece)?.rot !== 0; i += 1) act(() => hook.result.current.rotate(piece));
  expect(looseOf(hook, piece)?.rot).toBe(0);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('jigsawPile', () => {
  it('the pile is the same after a reload', () => {
    const first = jigsawPile(3, 4, 1, 'p1');
    expect(jigsawPile(3, 4, 1, 'p1')).toEqual(first);
    expect(first.map((item) => item.piece).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const item of first) expect([0, 1, 2, 3]).toContain(item.rot);
    expect(first.some((item) => item.rot !== 0)).toBe(true);
    expect(jigsawPile(3, 4, 1, 'p2').map((item) => item.piece)).not.toEqual(first.map((item) => item.piece));
  });
});

describe('useJigsaw', () => {
  it('starts with every piece in the pile in the pile order', () => {
    const hook = mount(vi.fn<Send>());
    expect(hook.result.current.loose.map((item) => item.piece)).toEqual(jigsawPile(3, 4, hook.result.current.seed, 'p1').map((item) => item.piece));
    expect(hook.result.current.loose.every((item) => item.at === null)).toBe(true);
    expect(hook.result.current.placed.size).toBe(0);
  });

  it('the pile order stays whole when pieces leave it', () => {
    const hook = mount(vi.fn<Send>());
    const order = jigsawPile(3, 4, hook.result.current.seed, 'p1').map((item) => item.piece);
    expect(hook.result.current.pile).toEqual(order);
    hook.rerender({ info: infoOf({ placed: [order[0], order[3]], seq: 2 }) });
    act(() => hook.result.current.drop(order[5], { x: 2.5, y: 0.2 }));
    expect(hook.result.current.pile).toEqual(order);
  });

  it('a snapped drop sends the round-local number', () => {
    const { send } = deferred();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.grab(5));
    act(() => hook.result.current.drop(5, { x: 1.1, y: 1 }));
    expect(send).toHaveBeenCalledWith('player:jigsaw', { questionIndex: 0, piece: 5, x: 1.1, y: 1, rot: 0 });
    // Оптимістично: ще до ack.
    expect(hook.result.current.placed.has(5)).toBe(true);
    expect(looseOf(hook, 5)).toBeUndefined();
  });

  it('a drop away from its place stays where it fell and sends nothing', () => {
    const send = vi.fn<Send>();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 2.5, y: 0.2 }));
    expect(send).not.toHaveBeenCalled();
    expect(looseOf(hook, 5)?.at).toEqual({ x: 2.5, y: 0.2 });
    act(() => hook.result.current.drop(5, null));
    expect(looseOf(hook, 5)?.at).toBeNull();
  });

  it('a miss frees the piece', async () => {
    const { send, answer } = deferred();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 1, y: 1 }));
    expect(hook.result.current.placed.has(5)).toBe(true);
    await answer({ ok: false, error: 'jigsaw_miss' });
    expect(hook.result.current.placed.has(5)).toBe(false);
    expect(looseOf(hook, 5)?.at).toEqual({ x: 1, y: 1 });
    expect(hook.result.current.notice).toBeNull();
  });

  it('an accepted piece stays placed before the snapshot', async () => {
    const { send, answer } = deferred();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 1, y: 1 }));
    await answer({ ok: true });
    expect(hook.result.current.placed.has(5)).toBe(true);
  });

  it('too soon tries again a moment later', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 1, y: 1 }));
    await answer({ ok: false, error: 'too_soon' });
    expect(hook.result.current.placed.has(5)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(JIGSAW_RETRY_MS));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:jigsaw', { questionIndex: 0, piece: 5, x: 1, y: 1, rot: 0 });
  });

  it('a piece placed by a teammate leaves my hand', () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: true }));
    const hook = mount(send, infoOf(), true);
    act(() => hook.result.current.grab(5));
    expect(hook.result.current.holding).toBe(5);
    hook.rerender({ info: infoOf({ placed: [5], seq: 1 }) });
    expect(hook.result.current.placed.has(5)).toBe(true);
    expect(looseOf(hook, 5)).toBeUndefined();
    expect(hook.result.current.holding).toBeNull();
    expect(hook.result.current.notice).toBeNull();
    // Рука порожня: «тримаю» більше не йде.
    const holds = send.mock.calls.length;
    act(() => vi.advanceTimersByTime(JIGSAW_HOLD_REFRESH_MS * 3));
    expect(send.mock.calls.length).toBe(holds);
  });

  it('placed by a teammate on my drop is not an error', async () => {
    const { send, answer } = deferred();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 1, y: 1 }));
    await answer({ ok: false, error: 'jigsaw_placed' });
    expect(hook.result.current.placed.has(5)).toBe(true);
    expect(hook.result.current.notice).toBeNull();
  });

  it('held by a teammate sends the piece back to the pile with a note', async () => {
    const { send, answer } = deferred();
    const hook = mount(send);
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 1, y: 1 }));
    await answer({ ok: false, error: 'jigsaw_held' });
    expect(hook.result.current.placed.has(5)).toBe(false);
    expect(looseOf(hook, 5)?.at).toBeNull();
    expect(hook.result.current.notice).not.toBeNull();
  });

  it('a held piece refreshes its hold', () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: true }));
    const hook = mount(send, infoOf(), true);
    act(() => hook.result.current.grab(3));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:jigsaw-hold', { questionIndex: 0, piece: 3 });
    act(() => vi.advanceTimersByTime(JIGSAW_HOLD_REFRESH_MS));
    expect(send).toHaveBeenCalledTimes(2);
    act(() => hook.result.current.drop(3, null));
    act(() => vi.advanceTimersByTime(JIGSAW_HOLD_REFRESH_MS * 3));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('alone sends no holds', () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>();
    const hook = mount(send);
    act(() => hook.result.current.grab(3));
    act(() => vi.advanceTimersByTime(JIGSAW_HOLD_REFRESH_MS * 2));
    expect(send).not.toHaveBeenCalled();
  });

  it("a teammate's held piece is not taken or turned", () => {
    const send = vi.fn<Send>();
    const hook = mount(send, infoOf({ held: [{ piece: 3, tone: '2' }] }), true);
    const rot = looseOf(hook, 3)?.rot;
    act(() => hook.result.current.grab(3));
    act(() => hook.result.current.rotate(3));
    expect(hook.result.current.holding).toBeNull();
    expect(looseOf(hook, 3)?.rot).toBe(rot);
    expect(send).not.toHaveBeenCalled();
  });

  it('nothing is sent when placing is closed', () => {
    const send = vi.fn<Send>();
    const hook = mount(send, infoOf({ canPlace: false }));
    upright(hook, 5);
    act(() => hook.result.current.drop(5, { x: 1, y: 1 }));
    expect(send).not.toHaveBeenCalled();
    expect(hook.result.current.placed.has(5)).toBe(false);
  });
});
