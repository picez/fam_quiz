// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@quiz/shared';
import { LadderLifelines } from './LadderLifelines';
import { ladderInfo } from './ladder-fixtures';

afterEach(cleanup);

const question = {
  type: 'single', text: 'Q', imageUrl: null, video: null, timeLimit: null, points: 0,
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  choices: [{ id: 'a', text: 'Львів' }, { id: 'b', text: 'Київ' }, { id: 'c', text: 'Одеса' }, { id: 'd', text: 'Харків' }],
};

type Own = NonNullable<PlayerView['me']['ladder']>;
const lifelineView = (
  info: Parameters<typeof ladderInfo>[0] = {},
  own: Partial<Own> = {},
  over: Partial<PlayerView> = {},
): PlayerView =>
  ({
    paused: false,
    splash: null,
    endsAt: null,
    remainingMs: null,
    question,
    ladder: ladderInfo({
      lifelines: [
        { kind: 'fifty', state: 'ready' },
        { kind: 'audience', state: 'ready' },
        { kind: 'hint', state: 'ready' },
      ],
      ...info,
    }),
    me: { ladder: { role: 'contestant', canLifeline: true, hint: null, canDecide: false, hallClosed: false, hallPoints: null, won: null, ...own } },
    ...over,
  }) as unknown as PlayerView;

describe('LadderLifelines', () => {
  it('shows three named buttons that fire onUse', () => {
    const onUse = vi.fn();
    render(<LadderLifelines view={lifelineView()} offsetMs={0} onUse={onUse} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(onUse).toHaveBeenCalledWith('fifty');
    expect(document.querySelectorAll('.ladder-lifeline')).toHaveLength(3);
  });

  it('a used lifeline is disabled, struck out and says so to a screen reader', () => {
    const view = lifelineView({ lifelines: [{ kind: 'fifty', state: 'used' }, { kind: 'audience', state: 'ready' }] });
    render(<LadderLifelines view={view} offsetMs={0} onUse={vi.fn()} />);
    const used = screen.getByRole('button', { name: /50\/50.*використано/ });
    expect(used.hasAttribute('disabled')).toBe(true);
    expect(used.classList.contains('is-used')).toBe(true);
    expect(screen.getByRole('button', { name: 'Зал' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables everything when the contestant cannot use a lifeline now', () => {
    render(<LadderLifelines view={lifelineView({}, { canLifeline: false })} offsetMs={0} onUse={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('disables everything once the time is over', () => {
    render(<LadderLifelines view={lifelineView({}, {}, { endsAt: Date.now() - 1000 })} offsetMs={0} onUse={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('shows the voting progress, then the percentages once the hall has voted', () => {
    const voting = { state: 'voting' as const, endsAt: null, remainingMs: null, voted: 1, total: 3, tally: null };
    render(<LadderLifelines view={lifelineView({ audience: voting })} offsetMs={0} onUse={vi.fn()} />);
    expect(screen.getByText('Зал голосує: 1 з 3')).toBeTruthy();
    cleanup();
    const closed = { ...voting, state: 'closed' as const, tally: { cast: 4, counts: { a: 1, b: 3 } } };
    render(<LadderLifelines view={lifelineView({ audience: closed })} offsetMs={0} onUse={vi.fn()} />);
    expect(screen.queryByText(/Зал голосує/)).toBeNull();
    expect(screen.getByText('Що каже зал')).toBeTruthy();
    expect(screen.getByText('75 %')).toBeTruthy();
  });

  it('the hall tally leaves out the options removed by 50/50', () => {
    const closed = { state: 'closed' as const, endsAt: null, remainingMs: null, voted: 2, total: 2, tally: { cast: 2, counts: { b: 1, d: 1 } } };
    render(<LadderLifelines view={lifelineView({ fifty: ['a', 'c'], audience: closed })} offsetMs={0} onUse={vi.fn()} />);
    expect(document.querySelectorAll('.vote-row')).toHaveLength(2);
    expect(screen.queryByText('Львів')).toBeNull();
    expect(screen.queryByText('Одеса')).toBeNull();
  });

  it('shows the host hint in its three states', () => {
    render(<LadderLifelines view={lifelineView({}, { hint: { state: 'waiting', text: null } })} offsetMs={0} onUse={vi.fn()} />);
    expect(screen.getByText('Ведучий думає…')).toBeTruthy();
    cleanup();
    render(<LadderLifelines view={lifelineView({}, { hint: { state: 'text', text: 'Над Дніпром' } })} offsetMs={0} onUse={vi.fn()} />);
    expect(screen.getByText(/Над Дніпром/)).toBeTruthy();
    cleanup();
    render(<LadderLifelines view={lifelineView({}, { hint: { state: 'aloud', text: null } })} offsetMs={0} onUse={vi.fn()} />);
    expect(screen.getByText('Ведучий підказав уголос')).toBeTruthy();
  });

  it('renders nothing for the hall or when no lifeline is enabled', () => {
    const { container } = render(<LadderLifelines view={lifelineView({}, { role: 'hall' })} offsetMs={0} onUse={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    const none = render(<LadderLifelines view={lifelineView({ lifelines: [] })} offsetMs={0} onUse={vi.fn()} />);
    expect(none.container.firstChild).toBeNull();
  });
});
