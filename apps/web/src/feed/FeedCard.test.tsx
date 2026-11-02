// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FeedEvent } from '@quiz/shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedCard } from './FeedCard';

afterEach(cleanup);

const event = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  id: 'e1',
  at: '2026-11-01T10:00:00.000Z',
  who: { id: 'p', nickname: 'Петро', avatar: null },
  mine: false,
  data: { kind: 'game', title: 'Писанки', place: 2, of: 5, team: null },
  likes: { count: 2, liked: false },
  ...over,
});

const show = (e: FeedEvent, onLike = vi.fn()) =>
  render(
    <MemoryRouter>
      <ol>
        <FeedCard event={e} onLike={onLike} />
      </ol>
    </MemoryRouter>,
  );

describe('FeedCard', () => {
  it("a friend's event has a heart with the count that sends the wished state", () => {
    const onLike = vi.fn();
    const e = event();
    show(e, onLike);
    const button = screen.getByRole('button', { name: 'Вподобати подію' });
    expect(button.textContent).toContain('2');
    fireEvent.click(button);
    expect(onLike).toHaveBeenCalledWith(e, true);
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/profile/p')).toBe(true);
  });

  it('own event shows «Ти» and only a static count', () => {
    show(event({ mine: true }));
    expect(screen.getByText('Ти')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('❤️ 2')).toBeTruthy();
    cleanup();
    show(event({ mine: true, likes: { count: 0, liked: false } }));
    expect(screen.queryByText(/❤️ /)).toBeNull();
  });

  it('a like card has no heart and links to the liker', () => {
    show(event({ mine: true, likes: null, data: { kind: 'like', questions: 1, quiz: true, host: false, player: false, title: null } }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Петро')).toBeTruthy();
  });

  it('a win has is-win', () => {
    const { container } = show(event({ data: { kind: 'game', title: 'Писанки', place: 1, of: 5, team: null } }));
    expect(container.querySelector('li.is-win')).not.toBeNull();
  });
});
