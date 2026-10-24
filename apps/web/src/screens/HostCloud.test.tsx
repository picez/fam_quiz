// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostCloud } from './HostCloud';

afterEach(cleanup);

const words = [
  { key: 'каштани', text: 'каштани', count: 2, hidden: false, by: ['Олена', 'Тарас'] },
  { key: 'борщ', text: 'борщ', count: 1, hidden: true, by: ['Олена'] },
];

describe('HostCloud', () => {
  it('a tap hides a shown word', () => {
    const onHide = vi.fn();
    render(<HostCloud words={words} onHide={onHide} />);
    const button = screen.getByRole('button', { name: 'каштани' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Олена, Тарас')).toBeTruthy();
    fireEvent.click(button);
    expect(onHide).toHaveBeenCalledWith('каштани', true);
  });

  it('a hidden word is pressed and a second tap brings it back', () => {
    const onHide = vi.fn();
    render(<HostCloud words={words} onHide={onHide} />);
    const button = screen.getByRole('button', { name: 'борщ' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onHide).toHaveBeenCalledWith('борщ', false);
  });
});
