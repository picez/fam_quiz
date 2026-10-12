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
});
