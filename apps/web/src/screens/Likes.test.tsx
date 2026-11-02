// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LikeButton, LikePanel } from './Likes';

afterEach(cleanup);

describe('LikeButton', () => {
  it('not liked: the pill likes on tap', () => {
    const onToggle = vi.fn();
    render(<LikeButton liked={false} onToggle={onToggle} busy={false} />);
    const button = screen.getByRole('button', { name: 'Вподобати запитання' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('liked: the pill takes the like back', () => {
    const onToggle = vi.fn();
    render(<LikeButton liked onToggle={onToggle} busy={false} />);
    const button = screen.getByRole('button', { name: 'Прибрати вподобання' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('undefined draws nothing', () => {
    const { container } = render(<LikeButton liked={undefined} onToggle={vi.fn()} busy={false} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LikePanel', () => {
  it('shows the quiz, the host and the people', () => {
    const onLike = vi.fn();
    render(<LikePanel likes={{ quiz: false, host: true, people: [{ id: 'p', nickname: 'Петро', liked: false }] }} onLike={onLike} busy={false} />);
    expect(screen.getByText('Сподобалось?')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Ведучий/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Вікторина/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Петро/ }));
    expect(onLike).toHaveBeenCalledWith({ target: 'player', id: 'p', liked: true });
    fireEvent.click(screen.getByRole('button', { name: /Ведучий/ }));
    expect(onLike).toHaveBeenCalledWith({ target: 'host', liked: false });
    fireEvent.click(screen.getByRole('button', { name: /Вікторина/ }));
    expect(onLike).toHaveBeenCalledWith({ target: 'quiz', liked: true });
  });

  it('nothing to like draws nothing', () => {
    expect(render(<LikePanel likes={{}} onLike={vi.fn()} busy={false} />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<LikePanel likes={undefined} onLike={vi.fn()} busy={false} />).container.innerHTML).toBe('');
    cleanup();
    expect(render(<LikePanel likes={{ people: [] }} onLike={vi.fn()} busy={false} />).container.innerHTML).toBe('');
  });
});
