// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BluffOptionView } from '@quiz/shared';
import type { Send } from '../live/types';
import { BluffChoice } from './BluffChoice';

afterEach(cleanup);

const option = (id: string, text: string): BluffOptionView => ({ id, text, open: false, kind: null, authors: null, pickedBy: null, removed: false });
const options = [option('b1', 'Рим'), option('b2', 'Мілан'), option('b3', 'Барселона'), option('b4', 'Париж'), option('b5', 'Лондон')];

describe('BluffChoice', () => {
  it('lists every option and disables the own lie with a label', () => {
    render(<BluffChoice options={options} own={['b2']} send={vi.fn(async () => ({ ok: true as const }))} />);
    expect(screen.getByText('Що з цього правда?')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    const own = screen.getByRole('button', { name: /Мілан/ }) as HTMLButtonElement;
    expect(own.disabled).toBe(true);
    expect(screen.getByText('Твоя вигадка')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Рим' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a tap sends the option id', () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    render(<BluffChoice options={options} own={[]} send={send as Send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Барселона' }));
    expect(send).toHaveBeenCalledWith('player:bluff', { optionId: 'b3' });
  });

  it('shows the ack error under the list', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'bluff_own' }));
    render(<BluffChoice options={options} own={[]} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Рим' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Свою вигадку вибрати не можна.'));
  });
});
