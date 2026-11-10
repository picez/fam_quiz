// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerPuzzle } from '@quiz/shared';
import type { Send, SendResult } from './types';
import { PUZZLE_ACK_MS, PUZZLE_FLUSH_MS, PUZZLE_RETRY_MS, usePuzzleBoard } from './usePuzzleBoard';

const infoOf = (over: Partial<PlayerPuzzle> = {}): PlayerPuzzle => ({
  cells: new Array<string>(36).fill(''),
  mask: '0'.repeat(36),
  done: false,
  canEdit: true,
  seq: 0,
  result: null,
  ...over,
});

const withCells = (base: PlayerPuzzle, values: Record<number, string>, seq: number): PlayerPuzzle => ({
  ...base,
  cells: base.cells.map((v, i) => values[i] ?? v),
  seq,
});

/** Ack, що відповідає, коли тест скаже. */
function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at](result)) };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function mount(send: Send, info = infoOf()) {
  return renderHook(({ info: now }) => usePuzzleBoard(now, 3, send), { initialProps: { info } });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePuzzleBoard', () => {
  it('batches edits and keeps one in flight', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const hook = mount(send);
    for (const [i, v] of [[0, '1'], [1, '2'], [2, '3'], [3, '4'], [4, '5']] as const) {
      act(() => hook.result.current.set(i, v));
      wait(20);
    }
    expect(send).not.toHaveBeenCalled();
    // Показ — одразу, ще до відправки.
    expect(hook.result.current.cells.slice(0, 5)).toEqual(['1', '2', '3', '4', '5']);
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:puzzle', { questionIndex: 3, cells: [{ i: 0, v: '1' }, { i: 1, v: '2' }, { i: 2, v: '3' }, { i: 3, v: '4' }, { i: 4, v: '5' }] });
    expect(hook.result.current.status).toBe('sending');
    act(() => hook.result.current.set(5, '6'));
    wait(PUZZLE_FLUSH_MS * 4);
    // Пакет у польоті — наступний чекає ack.
    expect(send).toHaveBeenCalledTimes(1);
    await answer({ ok: true });
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:puzzle', { questionIndex: 3, cells: [{ i: 5, v: '6' }] });
    await answer({ ok: true });
    // Ack прийшов, а зріз ще старий: свої значення не відкочуються.
    expect(hook.result.current.cells.slice(0, 6)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(hook.result.current.status).toBe('');
  });

  it('the last edit of a cell wins in a batch', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    const hook = mount(send);
    act(() => hook.result.current.set(7, '1'));
    act(() => hook.result.current.set(7, '2'));
    act(() => hook.result.current.set(8, '3'));
    act(() => hook.result.current.set(7, ''));
    expect(hook.result.current.cells[7]).toBe('');
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledWith('player:puzzle', { questionIndex: 3, cells: [{ i: 7, v: '' }, { i: 8, v: '3' }] });
  });

  it('server values show where nothing is pending', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const first = infoOf();
    const hook = mount(send, first);
    act(() => hook.result.current.set(0, '1'));
    // Товариш уписав клітинки 0 і 5: 5 видно одразу, а 0 — моя непідтверджена правка.
    hook.rerender({ info: withCells(first, { 0: '3', 5: '4' }, 1) });
    expect(hook.result.current.cells[5]).toBe('4');
    expect(hook.result.current.cells[0]).toBe('1');
    wait(PUZZLE_FLUSH_MS);
    await answer({ ok: true });
    // Ack є, а нового зрізу ще немає: лишається своє.
    expect(hook.result.current.cells[0]).toBe('1');
    hook.rerender({ info: withCells(first, { 0: '1', 5: '4' }, 2) });
    expect(hook.result.current.cells[0]).toBe('1');
    // Пізніше товариш переписав клітинку 0 — видно його значення.
    hook.rerender({ info: withCells(first, { 0: '6', 5: '4' }, 3) });
    expect(hook.result.current.cells[0]).toBe('6');
  });

  it('too soon requeues the batch', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const hook = mount(send);
    act(() => hook.result.current.set(0, '1'));
    act(() => hook.result.current.set(1, '2'));
    wait(PUZZLE_FLUSH_MS);
    act(() => hook.result.current.set(1, '5'));
    act(() => hook.result.current.set(2, '6'));
    await answer({ ok: false, error: 'too_soon' });
    // Мовчки: без тексту, значення лишаються.
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.cells.slice(0, 3)).toEqual(['1', '5', '6']);
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(2);
    const cells = (send.mock.calls[1][1] as { cells: { i: number; v: string }[] }).cells;
    // Новіша правка клітинки 1 перемагає повернуте з відмови.
    expect([...cells].sort((a, b) => a.i - b.i)).toEqual([{ i: 0, v: '1' }, { i: 1, v: '5' }, { i: 2, v: '6' }]);
  });

  it('a lost ack goes offline and retries', async () => {
    vi.useFakeTimers();
    const { send } = deferred();
    const hook = mount(send);
    act(() => hook.result.current.set(0, '1'));
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(PUZZLE_ACK_MS));
    expect(hook.result.current.status).toBe('offline');
    expect(hook.result.current.cells[0]).toBe('1');
    await act(async () => vi.advanceTimersByTimeAsync(PUZZLE_RETRY_MS));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:puzzle', { questionIndex: 3, cells: [{ i: 0, v: '1' }] });
  });

  it('stale clears the queue', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const hook = mount(send);
    act(() => hook.result.current.set(0, '1'));
    wait(PUZZLE_FLUSH_MS);
    act(() => hook.result.current.set(1, '2'));
    await answer({ ok: false, error: 'puzzle_stale' });
    expect(hook.result.current.cells.slice(0, 2)).toEqual(['', '']);
    expect(hook.result.current.error).toBeNull();
    wait(PUZZLE_FLUSH_MS * 4);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a refused cell shows its text and goes back to the server value', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const hook = mount(send);
    act(() => hook.result.current.set(0, '1'));
    wait(PUZZLE_FLUSH_MS);
    await answer({ ok: false, error: 'puzzle_given' });
    expect(hook.result.current.cells[0]).toBe('');
    expect(hook.result.current.error).toBe('Задану цифру змінити не можна.');
  });

  it('no edits while the grid is closed, and a pause holds the queue', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    const open = infoOf();
    const hook = mount(send, { ...open, canEdit: false });
    act(() => hook.result.current.set(0, '1'));
    expect(hook.result.current.cells[0]).toBe('');
    hook.rerender({ info: open });
    act(() => hook.result.current.set(0, '1'));
    hook.rerender({ info: { ...open, canEdit: false } });
    wait(PUZZLE_FLUSH_MS * 2);
    expect(send).not.toHaveBeenCalled();
    hook.rerender({ info: open });
    wait(PUZZLE_FLUSH_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('done flushes pending edits first', async () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const hook = mount(send);
    act(() => hook.result.current.set(0, '1'));
    let result: SendResult | undefined;
    await act(async () => {
      result = await hook.result.current.done();
    });
    expect(result).toEqual({ ok: true });
    expect(send.mock.calls.map((call) => call[0])).toEqual(['player:puzzle', 'player:puzzle-done']);
    expect(send).toHaveBeenLastCalledWith('player:puzzle-done', { questionIndex: 3 });
    // Після «Готово» правки не приймаються.
    act(() => hook.result.current.set(1, '2'));
    expect(hook.result.current.cells[1]).toBe('');
  });
});
