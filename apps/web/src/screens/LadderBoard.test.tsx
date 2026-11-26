// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { num } from '../format';
import { LadderBoard } from './LadderBoard';
import { ladderInfo } from './ladder-fixtures';

afterEach(cleanup);

describe('LadderBoard', () => {
  it('lists five steps top down with the biggest first', () => {
    render(<LadderBoard info={ladderInfo()} size="stage" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0].getAttribute('aria-label')).toBe('10000');
    expect(items[4].getAttribute('aria-label')).toBe('100');
  });

  it('marks the safe step with a class and a label that keeps the sum', () => {
    render(<LadderBoard info={ladderInfo()} size="stage" />);
    const safe = screen.getByLabelText(/неспалима/);
    expect(safe.classList.contains('is-safe')).toBe(true);
    expect(safe.getAttribute('aria-label')).toContain('1000');
  });

  it('highlights the current step and dims the passed ones', () => {
    render(<LadderBoard info={ladderInfo()} size="host" />);
    const current = screen.getByRole('listitem', { current: 'step' });
    expect(current.classList.contains('is-current')).toBe(true);
    expect(document.querySelectorAll('.is-passed')).toHaveLength(2);
  });

  it('marks the failed step', () => {
    const info = ladderInfo({ steps: ladderInfo().steps.map((step, i) => (i === 2 ? { ...step, state: 'failed' as const } : step)) });
    render(<LadderBoard info={info} size="stage" />);
    const failed = document.querySelector('.is-failed')!;
    expect(failed.getAttribute('aria-label')).toContain('помилка');
    expect(failed.textContent).toContain('✗');
  });

  it('the phone shows the whole ladder top down, not a window around the current step', () => {
    const levels = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000];
    const steps = levels.map((level, i) => ({ level, safe: i === 4 || i === 9, state: i < 6 ? ('passed' as const) : i === 6 ? ('current' as const) : ('ahead' as const) }));
    render(<LadderBoard info={ladderInfo({ steps, current: 6 })} size="phone" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(12);
    expect(items[0].getAttribute('aria-label')).toBe(num(125000));
    expect(items[11].getAttribute('aria-label')).toBe(num(100));
    expect(screen.getByRole('listitem', { current: 'step' }).getAttribute('aria-label')).toContain(num(4000));
    expect(document.querySelectorAll('.ladder-step.is-safe')).toHaveLength(2);
  });
});
