// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClueOpen } from '@quiz/shared';
import { ClueOpens, STAGE_OPENS_MAX } from './ClueOpens';

afterEach(cleanup);

const opens: ClueOpen[] = [
  { playerId: 'p1', nickname: 'Оля', opened: 1, answered: true },
  { playerId: 'p2', nickname: 'Петро', opened: 3, answered: true },
  { playerId: 'p3', nickname: 'Іра', opened: 2, answered: false },
];
const items = () => [...document.querySelectorAll('.clue-opens .clue-open')].map((span) => span.textContent);
const many = (count: number): ClueOpen[] => Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, nickname: `Гравець ${i + 1}`, opened: 2, answered: i % 2 === 0 }));

describe('ClueOpens (12c)', () => {
  it('says who opened how many before the reveal, one item per player, in a labelled group', () => {
    render(<ClueOpens opens={opens} revealed={false} />);
    const line = document.querySelector('.clue-opens') as HTMLElement;
    expect(items()).toEqual(['Оля 1', 'Петро 3', 'Іра 2']);
    expect(line.getAttribute('role')).toBe('group');
    expect(line.getAttribute('aria-label')).toBe('Скільки підказок відкрив кожен');
    expect(line.classList.contains('is-big')).toBe(false);
    expect(line.classList.contains('is-revealed')).toBe(false);
  });

  it('names the clue each answered on, or no answer, at the reveal', () => {
    render(<ClueOpens opens={opens} revealed big />);
    const line = document.querySelector('.clue-opens.is-big.is-revealed') as HTMLElement;
    expect(line).not.toBeNull();
    expect(items()).toEqual(['Оля — на підказці 1', 'Петро — на підказці 3', 'Іра — без відповіді']);
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<ClueOpens opens={[]} revealed={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('on the stage shows at most the cap and says how many more, before and at the reveal', () => {
    render(<ClueOpens opens={many(12)} revealed={false} big />);
    expect(items()).toHaveLength(STAGE_OPENS_MAX.asked + 1);
    expect(items().at(-1)).toBe(`та ще ${12 - STAGE_OPENS_MAX.asked}`);
    expect(document.querySelector('.clue-open.is-more')).not.toBeNull();
    cleanup();
    render(<ClueOpens opens={many(12)} revealed big />);
    expect(items()).toHaveLength(STAGE_OPENS_MAX.revealed + 1);
    expect(items()[0]).toBe('Гравець 1 — на підказці 2');
    expect(items().at(-1)).toBe(`та ще ${12 - STAGE_OPENS_MAX.revealed}`);
    // Сім імен і «та ще N»: по 1,2rem троє в рядку, три рядки на 1280 px.
    expect(STAGE_OPENS_MAX).toEqual({ asked: 7, revealed: 7 });
    expect(items().at(-1)).toBe('та ще 5');
  });

  it('on the stage shows everyone up to the cap without «та ще»', () => {
    render(<ClueOpens opens={many(STAGE_OPENS_MAX.revealed)} revealed big />);
    expect(items()).toHaveLength(STAGE_OPENS_MAX.revealed);
    expect(document.querySelector('.clue-open.is-more')).toBeNull();
  });

  it('on the host lists everyone', () => {
    render(<ClueOpens opens={many(12)} revealed />);
    expect(items()).toHaveLength(12);
    expect(document.querySelector('.clue-open.is-more')).toBeNull();
  });
});
