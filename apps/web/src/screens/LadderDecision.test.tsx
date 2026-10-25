// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LadderDecision } from './LadderDecision';
import { ladderInfo } from './ladder-fixtures';

afterEach(cleanup);

const info = () => ladderInfo({ banked: 1000, guaranteed: 1000, current: 2 });

describe('LadderDecision', () => {
  it('offers play on and take with the banked sum, and what is guaranteed and next', () => {
    const onDecide = vi.fn();
    render(<LadderDecision info={info()} disabled={false} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Забрати 1000' }));
    expect(onDecide).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Граю далі' }));
    expect(onDecide).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Гарантовано: 1000')).toBeTruthy();
    expect(screen.getByText('Наступне запитання — за 3000')).toBeTruthy();
  });

  it('keeps the buttons but does not fire when disabled', () => {
    const onDecide = vi.fn();
    render(<LadderDecision info={info()} disabled onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Забрати 1000' }));
    fireEvent.click(screen.getByRole('button', { name: 'Граю далі' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Граю далі' }).hasAttribute('disabled')).toBe(true);
  });
});
