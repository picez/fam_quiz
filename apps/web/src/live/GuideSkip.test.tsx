// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorText } from '../i18n';
import { GuideSkipLine, GuideSkipVote } from './GuideSkip';

afterEach(cleanup);
const ok = () => vi.fn(async () => ({ ok: true as const }));

describe('GuideSkipVote', () => {
  it('shows the vote button and the count, sends skip true', () => {
    const send = ok();
    render(<GuideSkipVote skip={{ votes: 0, of: 4, mine: false }} paused={false} send={send} onError={() => {}} />);
    const button = screen.getByRole('button', { name: 'Пропустити пояснення' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Хочуть пропустити: 0 з 4')).toBeTruthy();
    fireEvent.click(button);
    expect(send).toHaveBeenCalledWith('player:guide-skip', { skip: true });
  });
  it('a cast vote turns the button into Скасувати and sends skip false', () => {
    const send = ok();
    render(<GuideSkipVote skip={{ votes: 1, of: 4, mine: true }} paused={false} send={send} onError={() => {}} />);
    const button = screen.getByRole('button', { name: 'Скасувати' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(send).toHaveBeenCalledWith('player:guide-skip', { skip: false });
  });
  it('disabled while paused', () => {
    const send = ok();
    render(<GuideSkipVote skip={{ votes: 0, of: 2, mine: false }} paused send={send} onError={() => {}} />);
    const button = screen.getByRole('button', { name: 'Пропустити пояснення' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(send).not.toHaveBeenCalled();
  });
  it('the error from the server shows through onError', async () => {
    const onError = vi.fn();
    const send = vi.fn(async () => ({ ok: false as const, error: 'paused' }));
    render(<GuideSkipVote skip={{ votes: 0, of: 2, mine: false }} paused={false} send={send} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Пропустити пояснення' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(errorText('paused')));
  });
});

describe('GuideSkipLine', () => {
  it('stage line hides with no votes', () => {
    const { container, rerender } = render(<GuideSkipLine skip={{ votes: 0, of: 4 }} />);
    expect(container.textContent).toBe('');
    rerender(<GuideSkipLine skip={{ votes: 2, of: 4 }} />);
    expect(screen.getByText('Хочуть пропустити: 2 з 4')).toBeTruthy();
  });
});
