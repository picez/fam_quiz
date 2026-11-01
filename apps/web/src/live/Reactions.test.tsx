// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Reaction, Standing, SurvivalInfo } from '@quiz/shared';
import { ReactionStrip, ReactionsProvider } from './Reactions';
import { Standings } from '../screens/Standings';
import { ScoreTable } from '../screens/ScoreTable';
import { SurvivalBoard } from '../screens/SurvivalBoard';
import { teamsView } from '../screens/team-test-view';

afterEach(cleanup);

const row = (participantId: string, nickname: string, score: number, rank: number): Standing => ({ participantId, nickname, score, totalTimeMs: 1, rank });
const standings = [row('p1', 'Оля', 900, 1), row('p2', 'Тарас', 500, 2), row('p3', 'Петро', 300, 3)];

const reaction = (over: Partial<Reaction> = {}): Reaction => ({
  seq: 1,
  by: 'p1',
  nickname: 'Оля',
  rowId: 'p1',
  item: { kind: 'sticker', value: 'nyaBeach' },
  ...over,
});

const strip = () => document.querySelector('.reaction-strip') as HTMLElement;
const itemOf = (name: string) => [...document.querySelectorAll('.standings li')].find((li) => li.textContent?.includes(name)) as HTMLElement;

describe('reactions beside the names', () => {
  it('a sticker of Оля stands in her row and the strip stays empty', () => {
    render(
      <ReactionsProvider reactions={[reaction()]} size="phone">
        <Standings standings={standings} />
        <ReactionStrip />
      </ReactionsProvider>,
    );
    const img = itemOf('Оля').querySelector('.reaction-badge img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/stickers/nyaBeach.png');
    expect(img.getAttribute('alt')).toBe('Стікер nyaBeach');
    expect(img.getAttribute('width')).toBe('28');
    expect(itemOf('Тарас').querySelector('.reaction-badge')).toBeNull();
    expect(strip().getAttribute('aria-live')).toBe('polite');
    expect(strip().getAttribute('aria-label')).toBe('Реакції');
    expect(strip().querySelector('.reaction-strip-item')).toBeNull();
  });

  it('a trimmed row (limit) sends its reaction to the strip', () => {
    render(
      <ReactionsProvider reactions={[reaction({ by: 'p3', nickname: 'Петро', rowId: 'p3', item: { kind: 'emoji', value: '🔥' } })]} size="stage">
        <Standings standings={standings} limit={2} more={1} />
        <ReactionStrip />
      </ReactionsProvider>,
    );
    expect(document.querySelector('.standings .reaction-badge')).toBeNull();
    const item = strip().querySelector('.reaction-strip-item') as HTMLElement;
    expect(item.textContent).toContain('Петро');
    expect(item.querySelector('.reaction-badge.is-emoji')?.getAttribute('aria-label')).toBe('Реакція 🔥');
    expect(strip().classList.contains('is-stage')).toBe(true);
    expect(strip().getAttribute('role')).toBe('status');
  });

  it('the host reaction goes to the strip as «Ведучий»', () => {
    render(
      <ReactionsProvider reactions={[reaction({ by: 'host', nickname: null, rowId: null, item: { kind: 'emoji', value: '👏' } })]} size="host">
        <Standings standings={standings} />
        <ReactionStrip />
      </ReactionsProvider>,
    );
    expect(strip().textContent).toContain('Ведучий');
    expect(strip().textContent).toContain('👏');
    expect(document.querySelector('.standings .reaction-badge')).toBeNull();
  });

  it('on a team table the badge stands in the team row with the member name beside it', () => {
    const teams = teamsView();
    const teamRows = [row('team-b', 'Сині', 900, 1), row('team-a', 'Червоні', 500, 2)];
    render(
      <ReactionsProvider reactions={[reaction({ by: 'u1', nickname: 'Іра', rowId: 'team-b' })]} size="phone">
        <Standings standings={teamRows} teams={teams} />
        <ReactionStrip />
      </ReactionsProvider>,
    );
    const team = itemOf('Сині');
    expect(team.querySelector('.reaction-badge')).not.toBeNull();
    expect(team.querySelector('.reaction-by')?.textContent).toBe('Іра');
    expect(strip().querySelector('.reaction-strip-item')).toBeNull();
  });

  it('a solo row does not repeat the nickname beside the badge', () => {
    render(
      <ReactionsProvider reactions={[reaction()]} size="phone">
        <Standings standings={standings} />
      </ReactionsProvider>,
    );
    expect(document.querySelector('.reaction-by')).toBeNull();
  });

  it('ScoreTable outside a provider draws no badges', () => {
    render(<ScoreTable rows={standings} size="phone" breakdowns={{}} />);
    expect(document.querySelector('.reaction-badge')).toBeNull();
  });

  it('ScoreTable in a provider puts the badge in the name cell', () => {
    render(
      <ReactionsProvider reactions={[reaction({ by: 'p2', nickname: 'Тарас', rowId: 'p2' })]} size="host">
        <ScoreTable rows={standings} size="host" breakdowns={{}} />
        <ReactionStrip />
      </ReactionsProvider>,
    );
    const cell = [...document.querySelectorAll('.score-table th.name')].find((th) => th.textContent?.includes('Тарас')) as HTMLElement;
    expect(cell.querySelector('.reaction-badge img')).not.toBeNull();
    expect(strip().querySelector('.reaction-strip-item')).toBeNull();
  });

  it('SurvivalBoard with hideEdge sends the reaction of a player on the edge to the strip', () => {
    const info: SurvivalInfo = {
      rows: [
        { playerId: 'p1', nickname: 'Оля', status: 'alive', outAfter: null, trial: null, door: null },
        { playerId: 'p2', nickname: 'Тарас', status: 'edge', outAfter: null, trial: 'pending', door: null },
      ],
      aliveCount: 2,
      ghostCount: 0,
      ghosts: { right: null, answered: 0 },
    } as unknown as SurvivalInfo;
    render(
      <ReactionsProvider reactions={[reaction({ by: 'p2', nickname: 'Тарас', rowId: 'p2' }), reaction({ seq: 2 })]} size="phone">
        <SurvivalBoard info={info} size="phone" hideEdge />
        <ReactionStrip />
      </ReactionsProvider>,
    );
    const board = document.querySelector('.survival-board') as HTMLElement;
    expect(board.querySelectorAll('.reaction-badge')).toHaveLength(1);
    const items = strip().querySelectorAll('.reaction-strip-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Тарас');
  });
});
