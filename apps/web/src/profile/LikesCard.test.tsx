// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LikesCard } from './LikesCard';

afterEach(cleanup);

describe('LikesCard', () => {
  it('has its own heading on the public profile and none on the «Вподобання» page, which already says it', () => {
    render(<LikesCard likes={{ author: 4, host: 3, player: 1 }} />);
    expect(screen.getByRole('heading', { name: 'Вподобання' })).toBeTruthy();
    cleanup();
    render(<LikesCard likes={{ author: 4, host: 3, player: 1 }} heading={false} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('як автор')).toBeTruthy();
  });
});
