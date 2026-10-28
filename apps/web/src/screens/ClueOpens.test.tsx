// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClueOpen } from '@quiz/shared';
import { ClueOpens } from './ClueOpens';

afterEach(cleanup);

const opens: ClueOpen[] = [
  { playerId: 'p1', nickname: 'Оля', opened: 1, answered: true },
  { playerId: 'p2', nickname: 'Петро', opened: 3, answered: true },
  { playerId: 'p3', nickname: 'Іра', opened: 2, answered: false },
];

describe('ClueOpens (12c)', () => {
  it('says who opened how many before the reveal', () => {
    render(<ClueOpens opens={opens} revealed={false} />);
    const line = document.querySelector('.clue-opens') as HTMLElement;
    expect(line.textContent).toBe('Оля 1 · Петро 3 · Іра 2');
    expect(line.getAttribute('aria-label')).toBe('Скільки підказок відкрив кожен');
    expect(line.classList.contains('is-big')).toBe(false);
  });

  it('names the clue each answered on, or no answer, at the reveal', () => {
    render(<ClueOpens opens={opens} revealed big />);
    const line = document.querySelector('.clue-opens.is-big') as HTMLElement;
    expect(line.textContent).toBe('Оля — на підказці 1 · Петро — на підказці 3 · Іра — без відповіді');
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<ClueOpens opens={[]} revealed={false} />);
    expect(container.innerHTML).toBe('');
  });
});
