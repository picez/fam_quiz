// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '@quiz/shared';
import { LadderHall } from './LadderHall';
import { ladderInfo } from './ladder-fixtures';

afterEach(cleanup);

type Own = NonNullable<PlayerView['me']['ladder']>;
const hallView = (own: Partial<Own> = {}): PlayerView =>
  ({
    ladder: ladderInfo(),
    me: { ladder: { role: 'hall', canLifeline: false, hint: null, canDecide: false, hallClosed: false, hallPoints: 10, won: null, ...own } },
  }) as unknown as PlayerView;

describe('LadderHall', () => {
  it('names the contestant and the hall points', () => {
    render(<LadderHall view={hallView()} />);
    expect(screen.getByRole('status').textContent).toBe('Драбину проходить Олена. Відповідай за себе: правильно — +10.');
  });

  it('says it is too late once the hall has voted', () => {
    render(<LadderHall view={hallView({ hallClosed: true })} />);
    expect(screen.getByText('Зал уже проголосував — на це запитання відповідати пізно.')).toBeTruthy();
  });

  it('renders nothing for the contestant', () => {
    const { container } = render(<LadderHall view={hallView({ role: 'contestant' })} />);
    expect(container.firstChild).toBeNull();
  });
});
