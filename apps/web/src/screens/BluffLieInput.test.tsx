// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Send } from '../live/types';
import { BluffLieInput } from './BluffLieInput';

afterEach(cleanup);

const field = () => screen.getByLabelText('Твоя вигадка') as HTMLInputElement;
const sendButton = () => screen.getByRole('button', { name: 'Надіслати вигадку' }) as HTMLButtonElement;

describe('BluffLieInput', () => {
  it('the send button is disabled while the field is empty', () => {
    render(<BluffLieInput send={vi.fn(async () => ({ ok: true as const }))} autoFocus={false} />);
    expect(screen.getByText('Вигадай відповідь, у яку повірять інші')).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(field(), { target: { value: '   ' } });
    expect(sendButton().disabled).toBe(true);
  });

  it('sends the trimmed lie', () => {
    const send = vi.fn(async () => ({ ok: true as const }));
    render(<BluffLieInput send={send as Send} autoFocus={false} />);
    fireEvent.change(field(), { target: { value: ' Рим ' } });
    fireEvent.click(sendButton());
    expect(send).toHaveBeenCalledWith('player:lie', { text: 'Рим' });
  });

  it('shows «Це правда!» from the ack and keeps the text', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'bluff_truth' }));
    render(<BluffLieInput send={send} autoFocus={false} />);
    fireEvent.change(field(), { target: { value: 'Париж' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Це правда! Вигадай щось інше'));
    expect(field().value).toBe('Париж');
  });
});
