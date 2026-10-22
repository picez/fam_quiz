// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardInfo, TurnCircle } from '@quiz/shared';
import { TurnSchedule } from './TurnSchedule';

afterEach(cleanup);

const olya = { playerId: 'p1', nickname: 'Оля' };
const petro = { playerId: 'p2', nickname: 'Петро' };
const ira = { playerId: 'p3', nickname: 'Іра' };

const twoCircles = (done = 0): TurnCircle[] => [
  { number: 1, order: [olya, petro, ira], done },
  { number: 2, order: [petro, ira, olya], done: 0 },
];

const boardOf = (over: Partial<BoardInfo> = {}): BoardInfo => ({
  categories: [],
  order: [olya, petro, ira],
  turn: null,
  cell: null,
  dice: null,
  schedule: twoCircles(),
  scheduleRepeats: false,
  skipAt: null,
  ...over,
});

const circles = () => [...document.querySelectorAll('li.turn-circle')];

describe('TurnSchedule', () => {
  it('shows each circle as a line of names with arrows', () => {
    render(<TurnSchedule board={boardOf()} heading="Розклад ходів" />);
    expect(document.querySelector('section.turn-schedule')?.getAttribute('aria-label')).toBe('Розклад ходів');
    expect(document.querySelector('.turn-schedule h2')?.textContent).toBe('Розклад ходів');
    expect(circles().map((li) => li.textContent)).toEqual(['Коло 1: Оля → Петро → Іра', 'Коло 2: Петро → Іра → Оля']);
    expect(document.querySelector('.turn-arrow')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the current player and those who already went in the first circle only', () => {
    render(<TurnSchedule board={boardOf({ turn: petro, schedule: twoCircles(1) })} heading="Черга ходів" />);
    const [first, second] = circles();
    expect(first!.querySelector('.turn-name.is-turn')?.textContent).toBe('Петро');
    expect([...first!.querySelectorAll('.turn-name.is-done')].map((n) => n.textContent)).toEqual(['Оля']);
    expect(second!.querySelector('.is-turn')).toBeNull();
    expect(second!.querySelector('.is-done')).toBeNull();
  });

  it('limit cuts the circles; repeats adds a note; empty renders nothing', () => {
    const { container, rerender } = render(<TurnSchedule board={boardOf({ scheduleRepeats: true })} heading="Черга ходів" limit={1} />);
    expect(circles()).toHaveLength(1);
    expect(container.textContent).toContain('Далі черга повторюється');
    rerender(<TurnSchedule board={boardOf()} heading="Черга ходів" />);
    expect(container.textContent).not.toContain('Далі черга повторюється');
    rerender(<TurnSchedule board={boardOf({ schedule: [] })} heading="Черга ходів" />);
    expect(container.innerHTML).toBe('');
  });
});
