// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalDoors } from './SurvivalDoors';

afterEach(cleanup);

describe('SurvivalDoors', () => {
  it('shows three labelled doors and reports the pick', () => {
    const onPick = vi.fn();
    render(<SurvivalDoors picked={null} disabled={false} reveal={null} onPick={onPick} size="phone" />);
    const doors = [1, 2, 3].map((n) => screen.getByRole('button', { name: `Двері ${n}` }));
    expect(doors).toHaveLength(3);
    expect(document.querySelector('.survival-doors.is-phone')).not.toBeNull();
    fireEvent.click(doors[1]);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('marks the picked door', () => {
    render(<SurvivalDoors picked={2} disabled={false} reveal={null} onPick={vi.fn()} size="phone" />);
    expect(screen.getByRole('button', { name: 'Двері 3' }).className).toContain('is-picked');
    expect(screen.getByRole('button', { name: 'Двері 1' }).className).not.toContain('is-picked');
  });

  it('does not call back when disabled', () => {
    const onPick = vi.fn();
    render(<SurvivalDoors picked={null} disabled reveal={null} onPick={onPick} size="phone" />);
    fireEvent.click(screen.getByRole('button', { name: 'Двері 1' }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('after the close marks the trap and the picked door; an auto pick says so', () => {
    render(<SurvivalDoors picked={null} disabled={false} reveal={{ picked: 0, auto: true, trap: 2 }} size="phone" />);
    expect(screen.getByText('Пастка!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Двері 3' }).className).toContain('is-trap');
    expect(screen.getByRole('button', { name: 'Двері 1' }).className).toContain('is-picked');
    expect(screen.getByText('вибрано самі')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Двері 1' }).hasAttribute('disabled')).toBe(true);
  });
});
