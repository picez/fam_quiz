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

  it('focuses with preventScroll and never scrolls the page', () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    try {
      render(<Probe />);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('does not take focus out of an open modal sheet and tries again after it closes', () => {
    function WithSheet({ open, fieldsetDisabled = false }: { open: boolean; fieldsetDisabled?: boolean }) {
      return (
        <>
          <Probe fieldsetDisabled={fieldsetDisabled} />
          {open && (
            <div role="dialog" aria-modal="true" aria-label="аркуш" tabIndex={-1}>
              <button type="button">закрити</button>
            </div>
          )}
        </>
      );
    }
    const { rerender } = render(<WithSheet open fieldsetDisabled />);
    const sheet = screen.getByRole('dialog');
    sheet.focus();
    rerender(<WithSheet open />);
    expect(document.activeElement).toBe(sheet);
    rerender(<WithSheet open={false} />);
    expect(document.activeElement).toBe(screen.getByLabelText('поле'));
  });

  it('does not take focus from a button inside a non-modal dialog', () => {
    const { rerender } = render(
      <>
        <Probe fieldsetDisabled />
        <div role="dialog" aria-modal="false">
          <button type="button">довідка</button>
        </div>
      </>,
    );
    const button = screen.getByRole('button', { name: 'довідка' });
    button.focus();
    rerender(
      <>
        <Probe />
        <div role="dialog" aria-modal="false">
          <button type="button">довідка</button>
        </div>
      </>,
    );
    expect(document.activeElement).toBe(button);
  });

  it('focuses a field that is itself inside the open modal', () => {
    render(
      <div role="dialog" aria-modal="true">
        <Probe />
      </div>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('поле'));
  });
});
