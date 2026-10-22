// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdjustmentNotice } from '@quiz/shared';
import { AdjustmentToast, NOTICE_MS, StageDebuffs } from './LiveNotices';

const NOW = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const notice = (over: Partial<AdjustmentNotice> = {}): AdjustmentNotice => ({ seq: 1, at: NOW, nickname: 'Оля', points: -100, ...over });

describe('LiveNotices', () => {
  it('a new adjustment shows for four seconds', () => {
    render(<AdjustmentToast notice={notice()} offsetMs={0} />);
    expect(screen.getByRole('status').textContent).toBe('Ведучий: −100 — Оля');
    act(() => {
      vi.advanceTimersByTime(NOTICE_MS - 1);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('an old adjustment after a reconnect is not shown', () => {
    render(<AdjustmentToast notice={notice({ at: NOW - 10_000 })} offsetMs={0} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the next adjustment replaces the current one', () => {
    const { rerender } = render(<AdjustmentToast notice={notice()} offsetMs={0} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(<AdjustmentToast notice={notice({ seq: 2, at: NOW + 3000, nickname: 'Петро', points: 75 })} offsetMs={0} />);
    expect(screen.getByRole('status').textContent).toBe('Ведучий: +75 — Петро');
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses the synced clock: a device two seconds behind still shows it for four seconds', () => {
    render(<AdjustmentToast notice={notice({ at: NOW + 2000 })} offsetMs={2000} />);
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(NOTICE_MS - 1);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a notice three seconds old shows for the remaining second', () => {
    render(<AdjustmentToast notice={notice({ at: NOW - 3000 })} offsetMs={0} />);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a late offset sync does not shorten or drop a fresh notice', () => {
    const { rerender } = render(<AdjustmentToast notice={notice({ at: NOW + 2000 })} offsetMs={0} />);
    rerender(<AdjustmentToast notice={notice({ at: NOW + 2000 })} offsetMs={2000} />);
    expect(screen.queryByRole('status')).not.toBeNull();
  });

  it('unmounting clears the timer', () => {
    const { unmount } = render(<AdjustmentToast notice={notice()} offsetMs={0} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the notice is fixed and does not push the content', () => {
    const { container } = render(<AdjustmentToast notice={notice()} offsetMs={0} />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.className).toContain('live-notice');
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('the stage shows a bug beside each debuffed player and nothing else', () => {
    const { container } = render(<StageDebuffs debuffs={[{ playerId: 'p1', nickname: 'Оля' }, { playerId: 'p2', nickname: 'Петро' }]} />);
    const list = container.querySelector('ul.stage-debuffs');
    expect(list?.getAttribute('aria-label')).toBe('Наслано дебаф');
    expect([...list!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['🐞 Оля', '🐞 Петро']);
    cleanup();
    const empty = render(<StageDebuffs debuffs={[]} />);
    expect(empty.container.firstChild).toBeNull();
  });
});
