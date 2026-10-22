// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const singleQ: PublicQuestion = {
  ...base,
  type: 'single',
  text: 'Столиця?',
  choices: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
    { id: 'c', text: 'Одеса' },
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
    expect(render(<SpotlightChoices question={textQ} spotlight={null} reveal={null} />).container.textContent).toBe('Відповідь словами з’явиться тут');
  });

  it('numeric without an answer shows where the number will appear', () => {
    const q: PublicQuestion = { ...base, type: 'numeric', text: 'Скільки?', choices: [] };
    const { container } = render(<SpotlightChoices question={q} spotlight={null} reveal={null} />);
    expect(container.querySelector('p.spotlight-answer.is-waiting')?.textContent).toBe('Відповідь числом з’явиться тут');
  });

  it('a voice answer says the player answers aloud', () => {
    const { container } = render(<SpotlightChoices question={textQ} spotlight={null} reveal={null} voice />);
    expect(container.querySelector('p.spotlight-answer.is-waiting')?.textContent).toBe('Гравець відповідає вголос');
  });

  it('a voice verdict without a named option shows the verdict alone', () => {
    const { container } = render(<SpotlightChoices question={textQ} spotlight={spot(null, 'correct')} reveal={null} voice blink />);
    const verdict = container.querySelector('p.spotlight-answer.is-correct');
    expect(verdict?.textContent).toBe('Правильно');
    expect(verdict?.className).toContain('is-blinking');
    cleanup();
    const single = render(<SpotlightChoices question={singleQ} spotlight={spot(null, 'wrong')} reveal={null} voice />);
    expect(single.container.querySelector('p.spotlight-answer.is-wrong')?.textContent).toBe('Неправильно');
    expect(single.container.querySelectorAll('.choice').length).toBe(3);
  });

  it('order without an answer lists the items in the shown order', () => {
    const { container } = render(<SpotlightChoices question={orderQ} spotlight={null} reveal={null} />);
    const items = [...container.querySelectorAll('ol.order.spotlight-order li')].map((li) => li.textContent);
    expect(items).toEqual(['Ужгород', 'Львів']);
    expect(container.querySelector('button')).toBeNull();
  });

  it('a verdict blinks only while blink is on', () => {
    const correct = spot({ type: 'single', optionId: 'b' }, 'correct');
    const on = render(<SpotlightChoices question={singleQ} spotlight={correct} reveal={null} blink />);
    expect(on.container.querySelector('.choice.is-correct.is-blinking')).not.toBeNull();
    cleanup();
    const off = render(<SpotlightChoices question={singleQ} spotlight={correct} reveal={null} />);
    expect(off.container.querySelector('.choice.is-correct')).not.toBeNull();
    expect(off.container.querySelector('.is-blinking')).toBeNull();
    cleanup();
    const pending = render(<SpotlightChoices question={singleQ} spotlight={spot({ type: 'single', optionId: 'b' }, null)} reveal={null} blink />);
    expect(pending.container.querySelector('.choice.is-pending')).not.toBeNull();
    expect(pending.container.querySelector('.is-blinking')).toBeNull();
  });

  it('the host names an option by tapping it', () => {
    const onName = vi.fn();
    render(<SpotlightChoices question={singleQ} spotlight={null} reveal={null} onName={onName} />);
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    expect(onName).toHaveBeenLastCalledWith({ type: 'single', optionId: 'b' });
    cleanup();
    render(<SpotlightChoices question={singleQ} spotlight={spot({ type: 'single', optionId: 'b' }, null)} reveal={null} onName={onName} />);
    const named = screen.getByRole('button', { name: /Київ/ });
    expect(named.getAttribute('aria-pressed')).toBe('true');
    expect(named.className).toContain('is-pending');
    fireEvent.click(named);
    expect(onName).toHaveBeenLastCalledWith(null);
    cleanup();
    const multiQ: PublicQuestion = { ...singleQ, type: 'multi' };
    render(<SpotlightChoices question={multiQ} spotlight={spot({ type: 'multi', optionIds: ['a'] }, null)} reveal={null} onName={onName} />);
    fireEvent.click(screen.getByRole('button', { name: /Одеса/ }));
    expect(onName).toHaveBeenLastCalledWith({ type: 'multi', optionIds: ['a', 'c'] });
    fireEvent.click(screen.getByRole('button', { name: /Львів/ }));
    expect(onName).toHaveBeenLastCalledWith(null);
    cleanup();
    const boolQ: PublicQuestion = { ...base, type: 'boolean', text: 'Так?', choices: [] };
    render(<SpotlightChoices question={boolQ} spotlight={null} reveal={null} onName={onName} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ні' }));
    expect(onName).toHaveBeenLastCalledWith({ type: 'boolean', value: false });
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
