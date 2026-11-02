// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PerksView } from '@quiz/shared';
import { Perks } from './Perks';

afterEach(cleanup);

const both: PerksView = { items: [{ kind: 'time', block: null }, { kind: 'hint', block: null }], timeMs: 5000, hint: null };

describe('Perks', () => {
  it('shows both buttons and sends the chosen kind', () => {
    const onUse = vi.fn();
    render(<Perks perks={both} ward={undefined} onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: '⏱ +5 с' }));
    expect(onUse).toHaveBeenCalledWith('time');
    expect(screen.getByRole('button', { name: '💡 Підказка рівня' })).toBeTruthy();
  });

  it('shows +10 с after level 20', () => {
    render(<Perks perks={{ ...both, timeMs: 10000 }} ward={undefined} onUse={vi.fn()} />);
    expect(screen.getByRole('button', { name: '⏱ +10 с' })).toBeTruthy();
  });

  it('a blocked button is disabled with the reason', () => {
    render(<Perks perks={{ ...both, items: [{ kind: 'time', block: 'used' }] }} ward={undefined} onUse={vi.fn()} />);
    const button = screen.getByRole('button', { name: '⏱ +5 с' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Уже використано в цій грі');
  });

  it('shows the hint card', () => {
    render(<Perks perks={{ ...both, hint: 'Місто Лева' }} ward={undefined} onUse={vi.fn()} />);
    expect(screen.getByText('💡 Місто Лева')).toBeTruthy();
  });

  it('ward chip, then the spent moment for 4 s', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Perks perks={null} ward="ready" onUse={vi.fn()} />);
      expect(screen.getByText('🛡 Оберіг')).toBeTruthy();
      rerender(<Perks perks={null} ward="spent" onUse={vi.fn()} />);
      expect(screen.getByText('🛡 Оберіг погасив дебаф')).toBeTruthy();
      act(() => void vi.advanceTimersByTime(4100));
      expect(screen.queryByText('🛡 Оберіг погасив дебаф')).toBeNull();
      // поза запитанням після миті — жодної порожньої смуги
      expect(document.querySelector('.perk-bar')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('in a question (holdSpace) the spent chip keeps its place, hidden, after the moment: the answers below do not jump', () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<Perks perks={both} ward="ready" holdSpace onUse={vi.fn()} />);
      rerender(<Perks perks={both} ward="spent" holdSpace onUse={vi.fn()} />);
      expect(screen.getByRole('status').textContent).toBe('🛡 Оберіг погасив дебаф');
      act(() => void vi.advanceTimersByTime(4100));
      expect(screen.queryByRole('status')).toBeNull();
      const held = container.querySelector('.perk-chip.is-spent');
      expect(held?.classList.contains('is-gone')).toBe(true);
      expect(held?.getAttribute('aria-hidden')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('an already spent ward on mount shows nothing', () => {
    const { container } = render(<Perks perks={null} ward="spent" onUse={vi.fn()} />);
    expect(screen.queryByText('🛡 Оберіг погасив дебаф')).toBeNull();
    expect(container.querySelector('.perk-chip')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('a long hint is clamped to its reserved lines and scrolls inside: the answers below stay put (375 px)', () => {
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path))!;
    const css = readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');
    const start = css.indexOf('\n.perk-hint {');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    const min = /min-height:\s*([^;]+);/.exec(body)?.[1];
    expect(min).toBeDefined();
    expect(/max-height:\s*([^;]+);/.exec(body)?.[1]).toBe(min);
    expect(body).toMatch(/overflow-y:\s*auto;/);
  });

  it('renders nothing when empty', () => {
    const { container } = render(<Perks perks={null} ward={undefined} onUse={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
