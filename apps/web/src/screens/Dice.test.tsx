// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceInfo, DiceRow } from '@quiz/shared';
import { DicePanel, ROLL_MS, useDiceSpin } from './Dice';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const row = (id: string, nickname: string, throws: number[], waiting = false): DiceRow => ({ playerId: id, nickname, throws, waiting });
const info = (rows: DiceRow[], extra: Partial<DiceInfo> = {}): DiceInfo => ({ rows, tieBreak: false, done: false, ...extra });
const li = (n: number) => document.querySelectorAll('.dice-rows li')[n]!;

function Harness({ rows, meId }: { rows: DiceRow[]; meId?: string }) {
  const spinning = useDiceSpin(rows);
  return <DicePanel dice={info(rows)} spinning={spinning} meId={meId} />;
}

describe('DicePanel', () => {
  it('a first render with results does not spin', () => {
    const rows = [row('p1', 'Оля', [5])];
    const { result } = renderHook(() => useDiceSpin(rows));
    expect(result.current.size).toBe(0);
    render(<Harness rows={rows} />);
    expect(document.querySelector('.is-rolling')).toBeNull();
    expect(document.querySelector('.dice-value')!.textContent).toBe('5');
  });

  it('a new throw spins for ROLL_MS and hides the result meanwhile', () => {
    const before = [row('p1', 'Оля', [5]), row('p2', 'Петро', [])];
    const after = [row('p1', 'Оля', [5]), row('p2', 'Петро', [3])];
    const hook = renderHook(({ rows }) => useDiceSpin(rows), { initialProps: { rows: before } });
    hook.rerender({ rows: after });
    expect([...hook.result.current]).toEqual(['p2']);
    const view = render(<Harness rows={before} />);
    view.rerender(<Harness rows={after} />);
    expect(li(1).querySelector('.die.is-rolling')).not.toBeNull();
    expect(li(1).querySelector('.dice-value')!.textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(ROLL_MS);
    });
    expect(li(1).querySelector('.is-rolling')).toBeNull();
    expect(li(1).querySelector('.dice-value')!.textContent).toBe('3');
  });

  it('a re-roll spins again and keeps the earlier throws', () => {
    const view = render(<Harness rows={[row('p1', 'Оля', [5])]} />);
    view.rerender(<Harness rows={[row('p1', 'Оля', [5, 6])]} />);
    expect(li(0).querySelector('.is-rolling')).not.toBeNull();
    expect(li(0).querySelector('.dice-throws')!.textContent).toBe('5 →');
    act(() => {
      vi.advanceTimersByTime(ROLL_MS);
    });
    expect(li(0).querySelector('.dice-value')!.textContent).toBe('6');
    expect(li(0).querySelector('.dice-throws')!.textContent).toBe('5 →');
  });

  it('reduce motion shows the result at once', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));
    const hook = renderHook(({ rows }) => useDiceSpin(rows), { initialProps: { rows: [row('p1', 'Оля', [])] } });
    hook.rerender({ rows: [row('p1', 'Оля', [4])] });
    expect(hook.result.current.size).toBe(0);
  });

  it('rows keep join order and a fixed die slot', () => {
    const rows = [row('p1', 'Оля', [2]), row('p2', 'Петро', [], true), row('p3', 'Іра', [6])];
    render(<Harness rows={rows} />);
    expect([...document.querySelectorAll('.dice-rows .name')].map((n) => n.textContent)).toEqual(['Оля', 'Петро', 'Іра']);
    expect(li(1).querySelector('.die.is-empty')).not.toBeNull();
    for (let i = 0; i < 3; i += 1) expect(li(i).querySelectorAll('.die')).toHaveLength(1);
  });

  it('the status names who rolls, the tie and the end', () => {
    const rows = [row('p1', 'Оля', [2]), row('p2', 'Петро', [], true), row('p3', 'Іра', [], true)];
    const status = () => document.querySelector('.dice-status')!.textContent;
    const view = render(<DicePanel dice={info(rows)} spinning={new Set()} />);
    expect(status()).toBe('Кидають: Петро, Іра');
    view.rerender(<DicePanel dice={info(rows, { tieBreak: true })} spinning={new Set()} />);
    expect(status()).toBe('Нічия! Перекидають: Петро, Іра');
    view.rerender(<DicePanel dice={info(rows, { done: true })} spinning={new Set()} />);
    expect(status()).toBe('Порядок визначено');
  });

  it('the own row is marked', () => {
    render(<Harness rows={[row('p1', 'Оля', [2]), row('p2', 'Петро', [3])]} meId="p2" />);
    expect(li(1).classList.contains('is-me')).toBe(true);
    expect(li(0).classList.contains('is-me')).toBe(false);
  });
});
