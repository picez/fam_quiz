// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudInput } from './CloudInput';

afterEach(cleanup);

const field = (n: number) => screen.getByLabelText(`Слово ${n}`) as HTMLInputElement;
const type = (n: number, value: string) => fireEvent.change(field(n), { target: { value } });

describe('CloudInput', () => {
  it('adds fields up to the limit and then offers no more', () => {
    render(<CloudInput words={3} onSubmit={() => {}} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '＋ Ще слово' }));
    fireEvent.click(screen.getByRole('button', { name: '＋ Ще слово' }));
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '＋ Ще слово' })).toBeNull();
  });

  it('flags repeats ignoring case and spaces', () => {
    render(<CloudInput words={3} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '＋ Ще слово' }));
    type(1, 'Каштани');
    expect(screen.queryByText('Це слово вже є')).toBeNull();
    type(2, ' каштани ');
    expect(screen.getAllByText('Це слово вже є')).toHaveLength(2);
  });

  it('submit is disabled while empty, then sends the trimmed words', () => {
    const onSubmit = vi.fn();
    render(<CloudInput words={3} onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Відповісти' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '＋ Ще слово' }));
    fireEvent.click(screen.getByRole('button', { name: '＋ Ще слово' }));
    type(1, ' Каштани ');
    type(3, 'Дніпро');
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'wordcloud', words: ['Каштани', 'Дніпро'] });
  });

  it('every change drafts the cloud words; empty drafts null', () => {
    const onDraft = vi.fn();
    render(<CloudInput words={2} onSubmit={() => {}} onDraft={onDraft} autoFocus={false} />);
    fireEvent.click(screen.getByRole('button', { name: '＋ Ще слово' }));
    type(1, 'Каштан');
    type(2, ' липа ');
    expect(onDraft).toHaveBeenLastCalledWith({ type: 'wordcloud', words: ['Каштан', 'липа'] });
    type(1, '');
    type(2, '');
    expect(onDraft).toHaveBeenLastCalledWith(null);
  });
});
