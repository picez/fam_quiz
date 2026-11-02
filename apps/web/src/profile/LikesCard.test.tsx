// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LikesCard } from './LikesCard';

afterEach(cleanup);

describe('LikesCard', () => {
  it('shows three tiles in order: author, host, player', () => {
    const { container } = render(<LikesCard likes={{ author: 12, host: 3, player: 0 }} />);
    expect(screen.getByRole('heading', { name: 'Вподобання' })).toBeTruthy();
    const tiles = [...container.querySelectorAll('.likes-tile')].map((el) => el.textContent);
    expect(tiles).toEqual(['❤️ 12як автор', '❤️ 3як ведучий', '❤️ 0як гравець']);
  });

  it('writes big numbers through num()', () => {
    const { container } = render(<LikesCard likes={{ author: 1234, host: 0, player: 0 }} />);
    expect(container.querySelector('.likes-tile strong')?.textContent).toContain('1234');
  });
});
