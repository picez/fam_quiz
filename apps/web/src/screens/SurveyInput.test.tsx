// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurveyInput } from './SurveyInput';

afterEach(cleanup);

const field = (n: number) => screen.getByLabelText(`Відповідь ${n}`) as HTMLInputElement;
const type = (n: number, value: string) => fireEvent.change(field(n), { target: { value } });

describe('SurveyInput', () => {
  it('shows all the fields at once and the submit button is disabled while empty', () => {
    render(<SurveyInput answers={3} onSubmit={() => {}} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.getByText('Назви до 3 найпопулярніших відповідей')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Відповісти' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('flags repeats ignoring case and spaces', () => {
    render(<SurveyInput answers={3} onSubmit={() => {}} />);
    type(1, 'Яблуко');
    expect(screen.queryByText('Ця відповідь уже є')).toBeNull();
    type(2, ' яблуко ');
    expect(screen.getAllByText('Ця відповідь уже є')).toHaveLength(2);
  });

  it('Enter moves to the next field and submits from the last one', () => {
    const onSubmit = vi.fn();
    render(<SurveyInput answers={2} onSubmit={onSubmit} autoFocus={false} />);
    type(1, 'Яблуко');
    fireEvent.keyDown(field(1), { key: 'Enter' });
    expect(document.activeElement).toBe(field(2));
    type(2, 'Банан');
    fireEvent.keyDown(field(2), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ type: 'survey', values: ['Яблуко', 'Банан'] });
  });

  it('sends the trimmed non-empty values', () => {
    const onSubmit = vi.fn();
    render(<SurveyInput answers={3} onSubmit={onSubmit} />);
    type(1, ' Яблуко ');
    type(3, 'Банан');
    fireEvent.click(screen.getByRole('button', { name: 'Відповісти' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'survey', values: ['Яблуко', 'Банан'] });
  });
});
