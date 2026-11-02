// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { FeedTabs } from './FeedTabs';

afterEach(cleanup);

describe('FeedTabs', () => {
  it('puts requests and decisions on the calendar tab and events on the friends tab', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <FeedTabs badge={{ events: 0, requests: 2, decisions: 1 }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Календар/ }).textContent).toContain('3');
    expect(screen.getByRole('link', { name: /Події друзів/ }).querySelector('.menu-badge')).toBeNull();
  });
});
