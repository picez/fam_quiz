// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PrizesView } from '@quiz/shared';
import { PlayingFor } from './PlayingFor';

afterEach(cleanup);

const prizes: PrizesView = {
  mine: null,
  places: [
    { place: 1, winner: null, content: { trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false } },
    { place: 2, winner: null, content: { trophy: null, engraving: null, real: { text: 'Піца 🍕', photoUrl: null }, title: 'Король вікторини', diploma: false } },
  ],
};

describe('PlayingFor', () => {
  it('stage: a heading and a row per place, no 3D', () => {
    const { container } = render(<PlayingFor prizes={prizes} size="stage" />);
    expect(screen.getByText('Граємо за')).toBeTruthy();
    expect(screen.getByText(/Золотий кубок/)).toBeTruthy();
    expect(screen.getByText('Піца 🍕')).toBeTruthy();
    expect(screen.getByText('👑 Король вікторини')).toBeTruthy();
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('model-viewer')).toBeNull();
  });

  it('phone: one line with the summaries', () => {
    render(<PlayingFor prizes={prizes} size="phone" />);
    expect(screen.getByText('Граємо за: 🏆 Золотий кубок · 🎁 Піца 🍕 · 🎗️ Титул «Король вікторини»')).toBeTruthy();
  });
});
