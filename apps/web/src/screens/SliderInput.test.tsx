// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuestion, PublicSlider } from '@quiz/shared';
import { SliderInput } from './SliderInput';

afterEach(cleanup);

const question = (slider: Partial<PublicSlider> = {}): PublicQuestion & { slider: PublicSlider } => ({
  type: 'slider',
  text: 'Скільки?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  choices: [],
  right: [], chain: null, sort: null, orderLabels: null, clues: null, pin: null, audio: null, reveal: null,
  slider: { min: 0, max: 100, step: 1, unit: '%', ...slider },
});

const value = () => document.querySelector('output')!.textContent;

describe('SliderInput', () => {
  it('starts in the middle and steps with the buttons, disabled at the bounds', () => {
    render(<SliderInput question={question({ min: 49, max: 51 })} onSubmit={() => {}} />);
    expect(value()).toBe('50 %');
    fireEvent.click(screen.getByRole('button', { name: 'Більше на 1' }));
    expect(value()).toBe('51 %');
    expect((screen.getByRole('button', { name: 'Більше на 1' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Менше на 1' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the dragged value and submits it', () => {
    const onSubmit = vi.fn();
    render(<SliderInput question={question()} onSubmit={onSubmit} />);
    expect(value()).toBe('50 %');
    fireEvent.change(screen.getByLabelText('Повзунок'), { target: { value: '73' } });
    expect(screen.getByText('73 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'slider', value: 73 });
  });

  it('can be sent without moving it', () => {
    const onSubmit = vi.fn();
    render(<SliderInput question={question()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'slider', value: 50 });
  });

  it('writes the number by the step: comma for 0.5', () => {
    render(<SliderInput question={question({ min: 0, max: 5, step: 0.5, unit: '' })} onSubmit={() => {}} />);
    expect(value()).toBe('2,5');
    expect(screen.getByRole('button', { name: 'Більше на 0,5' })).toBeTruthy();
  });

  it('snaps on the grid from min: min 0.5 with step 1', () => {
    const onSubmit = vi.fn();
    render(<SliderInput question={question({ min: 0.5, max: 5.5, step: 1, unit: '' })} onSubmit={onSubmit} />);
    expect(value()).toBe('3,5');
    expect(screen.getByLabelText('Повзунок').getAttribute('aria-valuetext')).toBe('3,5');
    fireEvent.change(screen.getByLabelText('Повзунок'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Більше на 1' }));
    expect(value()).toBe('3,5');
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'slider', value: 3.5 });
  });

  it('ten steps of 0.1 give exactly 1', () => {
    const onSubmit = vi.fn();
    render(<SliderInput question={question({ min: 0, max: 2, step: 0.1, unit: '' })} onSubmit={onSubmit} />);
    // Старт посередині: 1,0; десять кроків униз до 0, потім десять угору.
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Менше на 0,1' }));
    expect(value()).toBe('0,0');
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Більше на 0,1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'slider', value: 1 });
  });
});
