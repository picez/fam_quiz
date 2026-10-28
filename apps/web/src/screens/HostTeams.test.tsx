// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiceInfo, TeamsView } from '@quiz/shared';
import type { Send } from '../live/types';
import { HostTeams, TeamPeople } from './HostTeams';
import { teamsView } from './team-test-view';

// Кнопку «ⓘ» підміняємо, щоб перевірити лише id записів довідки.
vi.mock('../help/HelpButton', () => ({
  HelpButton: ({ id }: { id: string }) => <button type="button" data-help-id={id}>ⓘ</button>,
}));

afterEach(cleanup);

const lobby = (over: Partial<TeamsView> = {}) =>
  teamsView({
    unassigned: [{ id: 'u9', nickname: 'Ігор', connected: true }],
    ...over,
  });

function show(teams: TeamsView) {
  const send = vi.fn<Send>(async () => ({ ok: true as const }));
  const onError = vi.fn();
  render(<HostTeams teams={teams} send={send} onError={onError} />);
  return { send, onError };
}

describe('HostTeams', () => {
  it('has four forms, each with an info button, and switching sends host:team-form', async () => {
    const { send } = show(lobby());
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['host', 'pick', 'random', 'dice']);
    expect([...document.querySelectorAll('[data-help-id]')].map((b) => b.getAttribute('data-help-id'))).toEqual(['team.host', 'team.pick', 'team.random', 'team.dice']);
    expect((screen.getByRole('radio', { name: 'Гравці обирають' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Кубик' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-form', { form: 'dice' }));
  });

  it('moves a member with the «У команду» list', async () => {
    const { send } = show(lobby());
    fireEvent.change(screen.getByLabelText('У команду: Ігор'), { target: { value: 'team-b' } });
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-assign', { memberId: 'u9', teamId: 'team-b' }));
  });

  it('can take a member out of a team with the same list', async () => {
    const { send } = show(lobby());
    fireEvent.change(screen.getByLabelText('У команду: Петро'), { target: { value: '' } });
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-assign', { memberId: 'u3', teamId: null }));
  });

  it('drags a nickname onto a team column', async () => {
    const { send } = show(lobby());
    const person = screen.getByText('Ігор').closest('li')!;
    const column = document.querySelector('[data-team-id="team-b"]')!;
    fireEvent.dragStart(person);
    fireEvent.dragOver(column);
    expect(column.classList.contains('is-over')).toBe(true);
    fireEvent.drop(column);
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-assign', { memberId: 'u9', teamId: 'team-b' }));
    expect(column.classList.contains('is-over')).toBe(false);
  });

  it('names a captain', async () => {
    const { send } = show(lobby());
    fireEvent.click(screen.getByRole('button', { name: 'Капітан: Петро' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:captain', { teamId: 'team-b', memberId: 'u3' }));
    expect(screen.queryByRole('button', { name: 'Капітан: Оля' })).toBeNull();
  });

  it('deals at random', async () => {
    const { send } = show(lobby({ form: 'random' }));
    fireEvent.click(screen.getByRole('button', { name: 'Розподілити' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-deal', undefined));
  });

  it('starts the dice, then rolls for the rest while the round is open', async () => {
    const { send } = show(lobby({ form: 'dice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Кидаємо кубики' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:team-dice', undefined));
    cleanup();
    const dice: DiceInfo = { rows: [{ playerId: 'u2', nickname: 'Оля', throws: [], waiting: true }], tieBreak: false, done: false };
    const second = show(lobby({ form: 'dice', dice }));
    expect(screen.queryByRole('button', { name: 'Кидаємо кубики' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Кинути за решту' }));
    await waitFor(() => expect(second.send).toHaveBeenCalledWith('host:team-roll', undefined));
  });

  it('shows the server error', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false as const, error: 'dice_pending' }));
    const onError = vi.fn();
    render(<HostTeams teams={lobby()} send={send} onError={onError} />);
    fireEvent.change(screen.getByLabelText('У команду: Ігор'), { target: { value: 'team-b' } });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Ще не всі кинули кубик.'));
  });

  it('kicks a member or an unassigned person in the lobby', () => {
    const onKick = vi.fn();
    render(<HostTeams teams={lobby()} send={vi.fn<Send>(async () => ({ ok: true as const }))} onError={vi.fn()} onKick={onKick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Вилучити: Ігор' }));
    expect(onKick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'u9' }));
    fireEvent.click(screen.getByRole('button', { name: 'Вилучити: Петро' }));
    expect(onKick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'u3' }));
  });

  it('has no kick buttons without onKick', () => {
    show(lobby());
    expect(screen.queryByRole('button', { name: /^Вилучити/ })).toBeNull();
  });

  it('drag and the move list are inert during an open dice round', () => {
    const dice: DiceInfo = { rows: [{ playerId: 'u2', nickname: 'Оля', throws: [], waiting: true }], tieBreak: false, done: false };
    const { send } = show(lobby({ form: 'dice', dice }));
    expect((screen.getByLabelText('У команду: Ігор') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText('Ігор').closest('li')!.getAttribute('draggable')).toBe('false');
    expect(screen.getByText('Петро').closest('li')!.getAttribute('draggable')).toBe('false');
    const column = document.querySelector('[data-team-id="team-b"]')!;
    fireEvent.dragStart(screen.getByText('Ігор').closest('li')!);
    fireEvent.drop(column);
    expect(send).not.toHaveBeenCalled();
  });

  it('sets the drag data for Firefox and clears the highlight when the drag ends', () => {
    show(lobby());
    const person = screen.getByText('Ігор').closest('li')!;
    const column = document.querySelector('[data-team-id="team-b"]')!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(person, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'u9');
    expect(dataTransfer.effectAllowed).toBe('move');
    fireEvent.dragOver(column);
    expect(column.classList.contains('is-over')).toBe(true);
    fireEvent.dragEnd(person);
    expect(column.classList.contains('is-over')).toBe(false);
  });

  it('puts the unassigned in their own column', () => {
    show(lobby());
    const none = document.querySelector('[data-team-id=""]') as HTMLElement;
    expect(within(none).getByText('Ігор')).toBeTruthy();
  });
});

describe('TeamPeople: who answers (12g)', () => {
  const people = (answererId: string) => {
    const team = { ...teamsView().teams[1]!, answererId };
    render(<TeamPeople team={team} onCaptain={vi.fn()} busy={false} />);
  };

  it('marks the answerer with 🎤 when it is not the captain', () => {
    people('u3');
    const marks = screen.getAllByRole('img', { name: 'відповідає' });
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('🎤');
    expect(marks[0]!.closest('li')!.textContent).toContain('Петро');
  });

  it('no mark while the captain answers', () => {
    people('u2');
    expect(screen.queryByRole('img', { name: 'відповідає' })).toBeNull();
  });
});
