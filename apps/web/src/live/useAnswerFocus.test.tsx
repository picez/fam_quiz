// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useAnswerFocus } from './useAnswerFocus';

function Probe({ disabled = false, fieldsetDisabled = false, allowed = true }: { disabled?: boolean; fieldsetDisabled?: boolean; allowed?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useAnswerFocus(ref, allowed);
  return (
    <div>
      <fieldset disabled={fieldsetDisabled}>
        <input aria-label="поле" disabled={disabled} ref={ref} />
      </fieldset>
      <input aria-label="інше" />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useAnswerFocus', () => {
  it('focuses the field once it is enabled', () => {
    const { rerender } = render(<Probe fieldsetDisabled />);
    expect(document.activeElement).not.toBe(screen.getByLabelText('поле'));
    rerender(<Probe />);
    expect(document.activeElement).toBe(screen.getByLabelText('поле'));
  });

  it('focuses a field that is itself disabled only after it is enabled', () => {
    const { rerender } = render(<Probe disabled />);
    expect(document.activeElement).toBe(document.body);
    rerender(<Probe />);
    expect(document.activeElement).toBe(screen.getByLabelText('поле'));
  });

  it('focuses once per mount', () => {
    const { rerender } = render(<Probe />);
    const other = screen.getByLabelText('інше');
    other.focus();
    other.blur();
    rerender(<Probe />);
    expect(document.activeElement).not.toBe(screen.getByLabelText('поле'));
  });

  it('does not steal from another field the player is typing in', () => {
    const { rerender } = render(<Probe fieldsetDisabled />);
    const other = screen.getByLabelText('інше');
    other.focus();
    rerender(<Probe />);
    expect(document.activeElement).toBe(other);
  });

  it('allowed false never focuses', () => {
    const { rerender } = render(<Probe allowed={false} />);
    rerender(<Probe allowed={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('uses no smooth scroll with reduced motion, smooth without', () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
    const first = render(<Probe />);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    first.unmount();
    scroll.mockClear();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    render(<Probe />);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });
});
