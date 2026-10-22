// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicQuestion, Question, Spotlight } from '@quiz/shared';
import { SpotlightChoices } from './SpotlightChoices';

afterEach(cleanup);

const base = { imageUrl: null, video: null, timeLimit: 20, points: 100, right: [], chain: null };
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

  it('match: shows the columns, then the player links in orange, then the correct pairs at the reveal', () => {
    const q: PublicQuestion = {
      ...base,
      type: 'match',
      text: 'Пари',
      choices: [
        { id: 'a', text: 'Київ' },
        { id: 'b', text: 'Львів' },
      ],
      right: [
        { id: 'y', text: 'Полтва' },
        { id: 'x', text: 'Дніпро' },
      ],
    };
    const links = [
      { left: 'b', right: 'x' },
      { left: 'a', right: 'y' },
    ];
    const { container } = render(<SpotlightChoices question={q} spotlight={null} reveal={null} />);
    expect(container.querySelector('.match-columns')).not.toBeNull();
    cleanup();
    const pending = render(<SpotlightChoices question={q} spotlight={spot({ type: 'match', links }, null)} reveal={null} />);
    expect(pending.container.querySelector('li.match-row.is-pending')?.textContent).toContain('Львів — Дніпро');
    cleanup();
    const full: Question = {
      id: 'q',
      type: 'match',
      text: 'Пари',
      imageUrl: null,
      video: null,
      timeLimit: 20,
      points: 100,
      pairs: [
        { left: q.choices[0], right: q.right[1] },
        { left: q.choices[1], right: q.right[0] },
      ],
    };
    const done = render(<SpotlightChoices question={q} spotlight={spot({ type: 'match', links }, 'wrong')} reveal={full} />);
    expect(done.container.querySelectorAll('li.match-row.is-wrong').length).toBe(2);
    expect(done.container.querySelector('li.match-row.is-correct')?.textContent).toContain('Київ — Дніпро');
    expect(screen.getByText('Правильні пари')).toBeTruthy();
  });
});
