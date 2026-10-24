// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPin, PublicQuestion } from '@quiz/shared';
import { PinInput } from './PinInput';

const question: PublicQuestion & { pin: PublicPin } = {
  type: 'pin',
  text: 'Де Львів?',
  imageUrl: null,
  video: null,
  timeLimit: 30,
  points: 1000,
  choices: [],
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  pin: { map: 'ukraine', aspect: 2 },
};

beforeEach(() => {
  // Рамка 300 × 150 у лівому верхньому куті.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const frame = () => screen.getByRole('group', { name: 'Мапа: торкнися, щоб поставити точку' });
const submit = () => screen.getByRole('button', { name: 'Відповісти' }) as HTMLButtonElement;
const layer = () => document.querySelector('.pin-zoom-layer') as HTMLElement;

function tap(x: number, y: number, pointerId = 1) {
  fireEvent.pointerDown(frame(), { pointerId, clientX: x, clientY: y });
  fireEvent.pointerUp(frame(), { pointerId, clientX: x, clientY: y });
}

describe('PinInput', () => {
  it('a tap places the pin, another tap moves it, and the answer carries the shares', () => {
    const onSubmit = vi.fn();
    render(<PinInput question={question} onSubmit={onSubmit} />);
    expect(submit().disabled).toBe(true);
    expect(screen.getByText('Торкнися мапи, щоб поставити точку. Двома пальцями — наблизити.')).toBeTruthy();
    tap(75, 75);
    const mine = document.querySelector('.pin-mark.is-mine') as HTMLElement;
    expect(mine).not.toBeNull();
    expect(mine.style.left).toBe('25%');
    expect(mine.style.top).toBe('50%');
    tap(150, 30);
    expect(document.querySelectorAll('.pin-mark.is-mine')).toHaveLength(1);
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith({ type: 'pin', x: 0.5, y: 0.2 });
  });

  it('the zoom buttons scale the layer around the centre; a tap then counts the offset; the pin keeps its size', () => {
    const onSubmit = vi.fn();
    render(<PinInput question={question} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Наблизити' }));
    expect(layer().style.transform).toContain('scale(1.5)');
    tap(0, 0);
    const mine = document.querySelector('.pin-mark.is-mine') as HTMLElement;
    expect(mine.style.transform).toContain(`scale(${1 / 1.5})`);
    fireEvent.click(submit());
    const answer = onSubmit.mock.calls[0][0] as { x: number; y: number };
    expect(answer.x).toBeCloseTo(1 / 6);
    expect(answer.y).toBeCloseTo(1 / 6);
    fireEvent.click(screen.getByRole('button', { name: 'Уся мапа' }));
    expect(layer().style.transform).toContain('scale(1)');
  });

  it('with a pin placed the zoom buttons zoom around the pin, which stays under the finger', () => {
    const onSubmit = vi.fn();
    render(<PinInput question={question} onSubmit={onSubmit} />);
    tap(60, 30);
    fireEvent.click(screen.getByRole('button', { name: 'Наблизити' }));
    expect(layer().style.transform).toBe('translate(-30px, -15px) scale(1.5)');
    tap(60, 30);
    fireEvent.click(submit());
    const answer = onSubmit.mock.calls[0][0] as { x: number; y: number };
    expect(answer.x).toBeCloseTo(0.2);
    expect(answer.y).toBeCloseTo(0.2);
  });

  it('under the mirror the zoom buttons also zoom around the pin', () => {
    render(
      <div className="is-mirror">
        <PinInput question={question} onSubmit={() => {}} />
      </div>,
    );
    tap(60, 30); // у дзеркалі це x = 240 рамки, тобто 0,8
    expect((document.querySelector('.pin-mark.is-mine') as HTMLElement).style.left).toBe('80%');
    fireEvent.click(screen.getByRole('button', { name: 'Наблизити' }));
    expect(layer().style.transform).toBe('translate(-120px, -15px) scale(1.5)');
  });

  it('a finger that moves more than a few pixels does not place the pin', () => {
    render(<PinInput question={question} onSubmit={() => {}} />);
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 75, clientY: 75 });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 95, clientY: 75 });
    fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 95, clientY: 75 });
    expect(document.querySelector('.pin-mark.is-mine')).toBeNull();
  });

  it('two fingers moving apart zoom in and place nothing', () => {
    render(<PinInput question={question} onSubmit={() => {}} />);
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 130, clientY: 75 });
    fireEvent.pointerDown(frame(), { pointerId: 2, clientX: 170, clientY: 75 });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 110, clientY: 75 });
    fireEvent.pointerMove(frame(), { pointerId: 2, clientX: 190, clientY: 75 });
    fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 110, clientY: 75 });
    fireEvent.pointerUp(frame(), { pointerId: 2, clientX: 190, clientY: 75 });
    expect(layer().style.transform).toContain('scale(2)');
    expect(document.querySelector('.pin-mark.is-mine')).toBeNull();
  });

  it('one finger drags a zoomed map', () => {
    render(<PinInput question={question} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Наблизити' }));
    expect(layer().style.transform).toContain('translate(-75px, -37.5px)');
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 75 });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 150, clientY: 75 });
    fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 150, clientY: 75 });
    expect(layer().style.transform).toContain('translate(-25px, -37.5px)');
    expect(document.querySelector('.pin-mark.is-mine')).toBeNull();
  });

  it('under the Mirror debuff the pin lands right under the finger', () => {
    const onSubmit = vi.fn();
    render(
      <div className="is-mirror">
        <PinInput question={question} onSubmit={onSubmit} />
      </div>,
    );
    tap(75, 75);
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith({ type: 'pin', x: 0.75, y: 0.5 });
  });

  it('a disabled input (pause, splash) ignores taps', () => {
    render(
      <fieldset disabled>
        <PinInput question={question} onSubmit={() => {}} />
      </fieldset>,
    );
    tap(75, 75);
    expect(document.querySelector('.pin-mark.is-mine')).toBeNull();
  });
});
