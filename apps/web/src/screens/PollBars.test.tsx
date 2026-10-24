// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PollBars } from './PollBars';

afterEach(cleanup);

const choices = [
  { id: 'a', text: 'Весна' },
  { id: 'b', text: 'Літо' },
  { id: 'c', text: 'Осінь' },
];

describe('PollBars', () => {
  it('shows percent and count for every option and marks the top one', () => {
    const { container } = render(<PollBars choices={choices} counts={{ a: 1, b: 3 }} total={4} />);
    expect(screen.getByText('75 % · 3')).toBeTruthy();
    expect(screen.getByText('25 % · 1')).toBeTruthy();
    expect(screen.getByText('0 % · 0')).toBeTruthy();
    const tops = container.querySelectorAll('.is-top');
    expect(tops).toHaveLength(1);
    expect(tops[0].textContent).toContain('Літо');
    expect((container.querySelectorAll('.poll-fill')[1] as HTMLElement).style.width).toBe('75%');
  });

  it('shows zeros without dividing by zero and highlights nobody', () => {
    const { container } = render(<PollBars choices={choices} counts={{}} total={0} />);
    expect(screen.getAllByText('0 % · 0')).toHaveLength(3);
    expect(container.querySelector('.is-top')).toBeNull();
  });
});
