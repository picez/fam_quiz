// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicQuestion, Spotlight } from '@quiz/shared';
import { SpotlightChoices } from './SpotlightChoices';

afterEach(cleanup);

const base = { imageUrl: null, timeLimit: 20, points: 100 };
const textQ: PublicQuestion = { ...base, type: 'text', text: 'Перлина?', choices: [] };
const orderQ: PublicQuestion = {
  ...base,
  type: 'order',
  text: 'Порядок',
  choices: [
    { id: 'x', text: 'Ужгород' },
    { id: 'y', text: 'Львів' },
  ],
};
const spot = (answer: Spotlight['answer'], grade: Spotlight['grade']): Spotlight => ({ playerId: 'p1', nickname: 'Анна', answer, grade });

describe('SpotlightChoices', () => {
  it('shows a typed answer for text, numeric and order questions', () => {
    const { container } = render(<SpotlightChoices question={textQ} spotlight={spot({ type: 'text', value: 'Одеса' }, null)} reveal={null} />);
    expect(container.querySelector('p.spotlight-answer.is-pending')?.textContent).toBe('Одеса');
    cleanup();
    const order = render(<SpotlightChoices question={orderQ} spotlight={spot({ type: 'order', itemIds: ['x', 'y'] }, 'wrong')} reveal={null} />);
    expect(order.container.querySelector('p.spotlight-answer.is-wrong')?.textContent).toBe('Ужгород → Львів');
    cleanup();
    expect(render(<SpotlightChoices question={textQ} spotlight={null} reveal={null} />).container.textContent).toBe('');
  });

  it('shows yes and no for a boolean question and colours the choice', () => {
    const q: PublicQuestion = { ...base, type: 'boolean', text: 'Так?', choices: [] };
    render(<SpotlightChoices question={q} spotlight={spot({ type: 'boolean', value: true }, null)} reveal={null} />);
    expect(screen.getByText('Так').closest('.choice')?.className).toContain('is-pending');
    expect(screen.getByText('Ні').closest('.choice')?.className).not.toContain('is-');
  });
});
