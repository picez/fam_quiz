// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StageSoundsControl } from '../live/useStageSounds';
import { StageSoundsButton } from './StageSounds';

afterEach(cleanup);

const control = (over: Partial<StageSoundsControl> = {}): StageSoundsControl => ({
  supported: true,
  hostOn: true,
  device: true,
  ready: false,
  unlock: vi.fn(),
  toggle: vi.fn(),
  ...over,
});

describe('StageSoundsButton', () => {
  it('unsupported — nothing', () => {
    const { container } = render(<StageSoundsButton control={control({ supported: false })} />);
    expect(container.innerHTML).toBe('');
  });

  it('host off — a quiet note', () => {
    render(<StageSoundsButton control={control({ hostOn: false })} />);
    expect(screen.getByText('Звуки вимкнув ведучий')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('locked — the unlock button', () => {
    const unlock = vi.fn();
    render(<StageSoundsButton control={control({ unlock })} />);
    fireEvent.click(screen.getByRole('button', { name: '🔊 Увімкнути звуки' }));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('ready — a pressed toggle', () => {
    const toggle = vi.fn();
    render(<StageSoundsButton control={control({ ready: true, toggle })} />);
    const button = screen.getByRole('button', { name: '🔔 Звуки' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('device off — an unpressed toggle', () => {
    render(<StageSoundsButton control={control({ device: false, ready: false })} />);
    expect(screen.getByRole('button', { name: '🔔 Звуки' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: '🔊 Увімкнути звуки' })).toBeNull();
  });
  it('the unlock button never becomes the toggle: a click that wakes the sound mid-event does not turn the device off', () => {
    // Клік будить контекст ще в фазі перехоплення (жест на сторінці); якби React перевикористав ту саму кнопку з новим
    // onClick, той самий клік дійшов би до перемикача й вимкнув звук пристрою.
    const toggle = vi.fn();
    const { rerender } = render(<StageSoundsButton control={control({ toggle })} />);
    const unlock = screen.getByRole('button', { name: '🔊 Увімкнути звуки' });
    rerender(<StageSoundsButton control={control({ ready: true, toggle })} />);
    const next = screen.getByRole('button', { name: '🔔 Звуки' });
    expect(next).not.toBe(unlock);
    fireEvent.click(unlock);
    expect(toggle).not.toHaveBeenCalled();
  });
});
