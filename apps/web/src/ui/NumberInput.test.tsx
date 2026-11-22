// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberInput, type NumberInputProps } from './NumberInput';

afterEach(cleanup);

function Field(props: Omit<NumberInputProps, 'value' | 'onChange'> & { seen?: (value: string) => void }) {
  const { seen, ...rest } = props;
  const [value, setValue] = useState('');
  return (
    <NumberInput
      aria-label="n"
      {...rest}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        seen?.(event.target.value);
      }}
    />
  );
}

const field = () => screen.getByLabelText('n') as HTMLInputElement;

describe('NumberInput', () => {
  it('is a text field with a number keypad', () => {
    render(<Field />);
    expect(field().type).toBe('text');
    expect(field().inputMode).toBe('numeric');
  });

  it('opens the decimal keypad for fractions and a full one for signed numbers', () => {
    render(<Field decimal />);
    expect(field().inputMode).toBe('decimal');
    cleanup();
    render(<Field negative />);
    expect(field().inputMode).toBe('text');
    cleanup();
    render(<Field negative inputMode="numeric" />);
    expect(field().inputMode).toBe('numeric');
  });

  it('hands the owner only the clean value', () => {
    const seen = vi.fn();
    render(<Field seen={seen} />);
    fireEvent.change(field(), { target: { value: '12abc34' } });
    expect(seen).toHaveBeenLastCalledWith('1234');
    expect(field().value).toBe('1234');
    fireEvent.change(field(), { target: { value: '1234e' } });
    expect(field().value).toBe('1234');
    fireEvent.change(field(), { target: { value: '+1234' } });
    expect(field().value).toBe('1234');
  });

  it('keeps a minus and a decimal separator only when allowed', () => {
    render(<Field negative decimal />);
    fireEvent.change(field(), { target: { value: '--2,5.1' } });
    expect(field().value).toBe('-2.51');
  });

  it('turns Arabic-Indic digits into Latin', () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: '٤٢' } });
    expect(field().value).toBe('42');
  });

  it('keeps the caret where the letter was dropped', () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: '1234' } });
    field().focus();
    field().setSelectionRange(3, 3);
    fireEvent.change(field(), { target: { value: '12x34', selectionStart: 3, selectionEnd: 3 } });
    expect(field().value).toBe('1234');
    expect(field().selectionStart).toBe(2);
  });

  it('steps with the arrow keys inside min and max', () => {
    const seen = vi.fn();
    render(<Field min={10} max={30} step={10} seen={seen} />);
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(field().value).toBe('10');
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(field().value).toBe('30');
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(field().value).toBe('20');
    expect(seen).toHaveBeenLastCalledWith('20');
  });

  it('leaves the arrow keys alone without bounds', () => {
    render(<Field />);
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(field().value).toBe('');
  });
});
