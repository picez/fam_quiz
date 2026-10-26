// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Send } from '../live/types';
import { AuthorLobby } from './AuthorLobby';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const joinUrl = 'https://quiz.example/play/123456';
const stageUrl = 'https://quiz.example/stage/123456#tok';

function show(options: { stageUrl?: string | null; send?: Send; onError?: (m: string | null) => void } = {}) {
  const send: Send = options.send ?? vi.fn(async () => ({ ok: true as const }));
  const onError = options.onError ?? vi.fn();
  render(<AuthorLobby code="123456" stageUrl={options.stageUrl === undefined ? stageUrl : options.stageUrl} joinUrl={joinUrl} send={send} onError={onError} />);
  return { send, onError };
}

describe('AuthorLobby', () => {
  it('shows the code as 123 456 and a QR of the join link', () => {
    show();
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Код кімнати')).toBeTruthy();
    const svg = document.querySelector('.author-lobby svg')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('data-value') ?? svg.querySelector('title')?.textContent ?? svg.getAttribute('aria-label')).toBe(joinUrl);
  });

  it('shows the stage link with the token, and nothing without it', () => {
    show();
    expect(screen.getByText(stageUrl)).toBeTruthy();
    expect(screen.getByText('Сцена для телевізора')).toBeTruthy();
    const open = screen.getByRole('link', { name: 'Відкрити сцену на цьому екрані' });
    expect(open.getAttribute('href')).toBe(stageUrl);
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener');
    cleanup();
    show({ stageUrl: null });
    expect(screen.queryByText('Сцена для телевізора')).toBeNull();
    expect(screen.queryByRole('link', { name: /Відкрити/ })).toBeNull();
    expect(screen.getByText('123 456')).toBeTruthy();
  });

  it('«Копіювати» writes the link to the clipboard and shows «Скопійовано» for 2 s', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.useFakeTimers();
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Копіювати' }));
    });
    expect(writeText).toHaveBeenCalledWith(stageUrl);
    expect(screen.getByRole('button', { name: 'Скопійовано' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole('button', { name: 'Копіювати' })).toBeTruthy();
  });

  it('a clipboard failure says so in a live line and the button stays «Копіювати»', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Копіювати' }));
    });
    expect(screen.getByRole('button', { name: 'Копіювати' })).toBeTruthy();
    const status = document.querySelector('.author-stage [aria-live="polite"]');
    expect(status?.textContent).toBe('Не вдалося скопіювати — виділіть посилання вручну.');
  });

  it('«Почати гру» is free again after a refusal', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'teams_few' }));
    show({ send });
    const button = screen.getByRole('button', { name: 'Почати гру' }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('«Почати гру» sends host:start once for a double tap', async () => {
    let release: () => void = () => undefined;
    const send = vi.fn(() => new Promise<{ ok: true }>((resolve) => (release = () => resolve({ ok: true }))));
    show({ send });
    const button = screen.getByRole('button', { name: 'Почати гру' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('host:start', undefined);
    await act(async () => release());
  });

  it('a server error goes to onError as text', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'teams_few' }));
    const { onError } = show({ send });
    fireEvent.click(screen.getByRole('button', { name: 'Почати гру' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Потрібно щонайменше дві команди з гравцями.'));
  });
});
