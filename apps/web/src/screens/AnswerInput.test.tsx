// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuestion } from '@quiz/shared';
import { AnswerInput } from './AnswerInput';

afterEach(cleanup);

const cities = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
  { id: 'c', text: 'Одеса' },
];

const question = (over: Partial<PublicQuestion>): PublicQuestion => ({
  type: 'single',
  text: 'Запитання',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  choices: cities,
  right: [],
  ...over,
});

function setup(over: Partial<PublicQuestion>) {
  const onSubmit = vi.fn();
  render(<AnswerInput question={question(over)} onSubmit={onSubmit} />);
  return onSubmit;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('AnswerInput', () => {
  it('single: sends the tapped option at once', () => {
    const onSubmit = setup({ type: 'single' });
    fireEvent.click(button(/Київ/));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'b' });
  });

  it('labels options with letters', () => {
    setup({ type: 'single' });
    expect(button(/Львів/).textContent).toContain('A');
    expect(button(/Одеса/).textContent).toContain('C');
  });

  it('multi: sends the selected options after confirmation', () => {
    const onSubmit = setup({ type: 'multi' });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.click(button(/Львів/));
    fireEvent.click(button(/Одеса/));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'multi', optionIds: ['a', 'c'] });
  });

  it('boolean: sends yes or no', () => {
    const onSubmit = setup({ type: 'boolean', choices: [] });
    fireEvent.click(button('Ні'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'boolean', value: false });
  });

  it('text: sends the trimmed text and refuses an empty one', () => {
    const onSubmit = setup({ type: 'text', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: '   ' } });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: '  Одеса ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'text', value: 'Одеса' });
  });

  it('numeric: accepts a decimal comma and refuses text', () => {
    const onSubmit = setup({ type: 'numeric', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');

    fireEvent.change(input, { target: { value: 'багато' } });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: ' 2061,5 ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'numeric', value: 2061.5 });
  });

  it('numeric: accepts a negative number and refuses an empty field', () => {
    const onSubmit = setup({ type: 'numeric', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');
    expect(button('Відповісти').disabled).toBe(true);
    fireEvent.change(input, { target: { value: '-12' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'numeric', value: -12 });
  });

  it('order: sends the items in the order the player arranged', () => {
    const onSubmit = setup({ type: 'order' });
    fireEvent.click(button('Перемістити вниз: Львів'));
    fireEvent.click(button('Перемістити вгору: Одеса'));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'order', itemIds: ['b', 'c', 'a'] });
  });

  it('order: cannot move the first item up or the last item down', () => {
    setup({ type: 'order' });
    expect(button('Перемістити вгору: Львів').disabled).toBe(true);
    expect(button('Перемістити вниз: Одеса').disabled).toBe(true);
  });

  describe('match', () => {
    const right = [
      { id: 'z', text: 'Уж' },
      { id: 'x', text: 'Дніпро' },
      { id: 'y', text: 'Полтва' },
    ];
    const left = [
      { id: 'a', text: 'Київ' },
      { id: 'b', text: 'Львів' },
      { id: 'c', text: 'Ужгород' },
    ];
    const matchSetup = (over: Partial<PublicQuestion> = {}) => setup({ type: 'match', choices: left, right, ...over });
    const connect = (l: string, r: string) => {
      fireEvent.click(button(new RegExp(`^${l}\\d*$`)));
      fireEvent.click(button(new RegExp(`^${r}\\d*$`)));
    };
    const linked = (name: string) => button(new RegExp(`^${name}\\d*$`)).className.includes('is-linked');

    it('connects left then right and sends all links when everything is connected', () => {
      const onSubmit = matchSetup();
      expect(button('Відповісти').disabled).toBe(true);
      connect('Київ', 'Дніпро');
      connect('Львів', 'Полтва');
      expect(button('Відповісти').disabled).toBe(true);
      connect('Ужгород', 'Уж');
      expect(button('Відповісти').disabled).toBe(false);
      fireEvent.click(button('Відповісти'));
      expect(onSubmit).toHaveBeenCalledWith({
        type: 'match',
        links: [
          { left: 'a', right: 'x' },
          { left: 'b', right: 'y' },
          { left: 'c', right: 'z' },
        ],
      });
    });

    it('tapping a connected item removes the link', () => {
      matchSetup();
      connect('Київ', 'Дніпро');
      fireEvent.click(button(/^Дніпро/));
      expect(linked('Київ')).toBe(false);
      expect(linked('Дніпро')).toBe(false);
      connect('Київ', 'Дніпро');
      fireEvent.click(button(/^Київ/));
      expect(linked('Київ')).toBe(false);
      expect(linked('Дніпро')).toBe(false);
      expect(button('Відповісти').disabled).toBe(true);
    });

    it('a right tap without a picked left does nothing and a second left moves the pick', () => {
      matchSetup();
      fireEvent.click(button(/^Уж$/));
      expect(document.querySelector('.is-linked')).toBeNull();
      fireEvent.click(button(/^Київ/));
      fireEvent.click(button(/^Львів/));
      expect(button(/^Київ/).getAttribute('aria-pressed')).toBe('false');
      expect(button(/^Львів/).getAttribute('aria-pressed')).toBe('true');
    });

    it('links by id when two right items have the same text', () => {
      const onSubmit = matchSetup({
        right: [
          { id: 'x', text: '1991' },
          { id: 'y', text: '1991' },
          { id: 'z', text: 'Уж' },
        ],
      });
      fireEvent.click(button(/^Київ/));
      fireEvent.click(screen.getAllByRole('button', { name: /^1991/ })[0]);
      connect('Львів', 'Уж');
      fireEvent.click(button(/^Ужгород/));
      fireEvent.click(screen.getAllByRole('button', { name: /^1991/ })[1]);
      fireEvent.click(button('Відповісти'));
      const links = onSubmit.mock.calls[0][0].links;
      expect(links).toContainEqual({ left: 'a', right: 'x' });
      expect(links).toContainEqual({ left: 'c', right: 'y' });
    });

    it('shows the pair number on both connected items', () => {
      matchSetup();
      connect('Львів', 'Дніпро');
      expect(button(/^Львів/).querySelector('.match-badge')?.textContent).toBe('2');
      expect(button(/Дніпро/).querySelector('.match-badge')?.textContent).toBe('2');
    });
  });
});
