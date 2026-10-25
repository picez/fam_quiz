// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('shows only the current and the two neighbours on the phone', () => {
    render(<LadderBoard info={ladderInfo()} size="phone" />);
    const labels = screen.getAllByRole('listitem').map((item) => item.getAttribute('aria-label'));
    expect(labels).toHaveLength(3);
    expect(labels[0]).toBe('3000');
    expect(labels[1]).toContain('1000');
    expect(labels[2]).toBe('300');
  });
});
