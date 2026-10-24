// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SliderScale } from './SliderScale';

afterEach(cleanup);

const slider = { min: 0, max: 100, step: 1, unit: '%' };
const marks = [
  { playerId: 'a', nickname: 'Оля', value: 57 },
  { playerId: 'b', nickname: 'Тарас', value: 20 },
  { playerId: 'c', nickname: 'Іра', value: 58 },
];

describe('SliderScale', () => {
  it('labels every player mark with the nickname and value', () => {
    render(<SliderScale slider={slider} correct={50} tolerance={2} marks={marks} highlight="a" />);
    expect(screen.getByLabelText('Оля: 57 %')).toBeTruthy();
    expect(screen.getByLabelText('Тарас: 20 %')).toBeTruthy();
    expect(screen.getByLabelText('Іра: 58 %')).toBeTruthy();
    expect(screen.getByLabelText('Оля: 57 %').className).toContain('is-near');
  });

  it('shows the correct value large and the tolerance band', () => {
    const { container } = render(<SliderScale slider={slider} correct={50} tolerance={2} zeroBeyond={10} marks={[]} />);
    expect(container.querySelector('.scale-correct-label')?.textContent).toBe('50 %');
    const band = container.querySelector<HTMLElement>('.scale-tolerance');
    expect(band?.style.left).toBe('48%');
    expect(band?.style.width).toBe('4%');
    const zero = container.querySelector<HTMLElement>('.scale-zero');
    expect(zero?.style.left).toBe('40%');
    expect(zero?.style.width).toBe('20%');
  });
});
