// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Answer, DebuffKind, PublicQuestion } from '@quiz/shared';
import { AnswerInput } from './AnswerInput';
import { DebuffZone } from './Debuffs';
import { splatsFor } from './wipe';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 300,
    bottom: 400,
    width: 300,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  // jsdom без canvas: getContext повертає null — шар має це пережити.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const single: PublicQuestion = {
  type: 'single',
  text: 'Що?',
  imageUrl: null,
  timeLimit: 30,
  video: null,
  points: 1000,
  choices: [
    { id: 'a', text: 'a' },
    { id: 'b', text: 'b' },
    { id: 'c', text: 'c' },
  ],
  right: [],
  orderLabels: null,
  chain: null,
  sort: null,
};

const zone = () => document.querySelector<HTMLElement>('.debuff-zone')!;
const fog = () => document.querySelector<HTMLElement>('.debuff-fog')!;
const splats = () => document.querySelectorAll('.debuff-splat');

function Zone({ kind, questionIndex = 2, onSubmit = () => {} }: { kind: DebuffKind; questionIndex?: number; onSubmit?: (a: Answer) => void }) {
  return (
    <DebuffZone debuff={{ kind, since: Date.now(), by: null }} limitMs={30_000} offsetMs={0} questionIndex={questionIndex}>
      <AnswerInput question={single} onSubmit={onSubmit} />
    </DebuffZone>
  );
}

describe('WipeLayers', () => {
  it('fog covers the zone and a finger move clears it where it passes', () => {
    render(<Zone kind="fog" />);
    expect(fog().dataset.cleared).toBe('0');
    fireEvent.pointerMove(zone(), { clientX: 150, clientY: 200 });
    expect(Number(fog().dataset.cleared)).toBeGreaterThan(0);
  });

  it('a touch move wipes too', () => {
    render(<Zone kind="fog" />);
    fireEvent.touchMove(zone(), { touches: [{ clientX: 30, clientY: 30 }], changedTouches: [{ clientX: 30, clientY: 30 }] });
    expect(Number(fog().dataset.cleared)).toBeGreaterThan(0);
  });

  it('only the fingers that moved wipe, a resting finger does not', () => {
    const moving = { clientX: 280, clientY: 380 };
    render(<Zone kind="fog" />);
    fireEvent.touchMove(zone(), { touches: [moving], changedTouches: [moving] });
    const alone = Number(fog().dataset.cleared);
    expect(alone).toBeGreaterThan(0);
    cleanup();
    // Другий палець лежить у протилежному куті: там туман лишається.
    render(<Zone kind="fog" />);
    fireEvent.touchMove(zone(), { touches: [{ clientX: 10, clientY: 10 }, moving], changedTouches: [moving] });
    expect(Number(fog().dataset.cleared)).toBe(alone);
  });

  it('a mouse wipes only with a button held, not by hovering', () => {
    render(<Zone kind="fog" />);
    fireEvent.pointerMove(zone(), { pointerType: 'mouse', buttons: 0, clientX: 150, clientY: 200 });
    expect(fog().dataset.cleared).toBe('0');
    fireEvent.pointerMove(zone(), { pointerType: 'mouse', buttons: 1, clientX: 150, clientY: 200 });
    expect(Number(fog().dataset.cleared)).toBeGreaterThan(0);
  });

  it('mud splats disappear when wiped', () => {
    render(<Zone kind="mud" />);
    expect(splats()).toHaveLength(6);
    const first = splatsFor(2)[0]!;
    for (let i = 0; i < 5; i++) fireEvent.pointerMove(zone(), { clientX: first.x * 300, clientY: first.y * 400 });
    expect(splats()).toHaveLength(5);
  });

  it('fog and mud layers never catch taps', () => {
    for (const kind of ['fog', 'mud'] as const) {
      const onSubmit = vi.fn();
      render(<Zone kind={kind} onSubmit={onSubmit} />);
      const layers = kind === 'fog' ? [fog()] : [...splats()];
      expect(layers.length).toBeGreaterThan(0);
      for (const layer of layers) expect(layer.classList.contains('debuff-layer')).toBe(true);
      fireEvent.pointerMove(zone(), { clientX: 150, clientY: 200 });
      fireEvent.click(screen.getByRole('button', { name: /c/ }));
      expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'c' });
      cleanup();
    }
  });

  it('the layers reset with a new question', () => {
    const { rerender } = render(<Zone kind="mud" questionIndex={2} />);
    const first = splatsFor(2)[0]!;
    for (let i = 0; i < 5; i++) fireEvent.pointerMove(zone(), { clientX: first.x * 300, clientY: first.y * 400 });
    expect(splats()).toHaveLength(5);
    rerender(<Zone kind="mud" questionIndex={3} />);
    expect(splats()).toHaveLength(6);

    rerender(<Zone kind="fog" questionIndex={3} />);
    fireEvent.pointerMove(zone(), { clientX: 150, clientY: 200 });
    expect(Number(fog().dataset.cleared)).toBeGreaterThan(0);
    rerender(<Zone kind="fog" questionIndex={4} />);
    expect(fog().dataset.cleared).toBe('0');
  });
});
