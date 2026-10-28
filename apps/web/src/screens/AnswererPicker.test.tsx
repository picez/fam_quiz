// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerTeam } from '@quiz/shared';
import type { Send } from '../live/types';
import { AnswererPicker } from './AnswererPicker';
import { teamPlayerView } from './team-test-view';

afterEach(cleanup);

const picking = (team: Partial<PlayerTeam> = {}) =>
  teamPlayerView({ phase: 'intro' }, { answererMode: 'chosen', canPickAnswerer: true, ...team });

const mount = (team: Partial<PlayerTeam> = {}, send: Send = vi.fn().mockResolvedValue({ ok: true }), onError = vi.fn()) => {
  render(<AnswererPicker view={picking(team)} send={send} onError={onError} />);
  return { send, onError };
};

describe('AnswererPicker', () => {
  it('renders nothing without the right to pick', () => {
    const { container } = render(<AnswererPicker view={teamPlayerView({ phase: 'intro' }, { answererMode: 'chosen' })} send={vi.fn()} onError={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('lists me and the teammates online; without a pick in chosen «Я» is pressed', () => {
    mount();
    expect(screen.getByText('Відповідає:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Я' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Петро' }).getAttribute('aria-pressed')).toBe('false');
    // Ната поза зв'язком, а «Оля» — це «Я».
    expect(screen.queryByRole('button', { name: 'Ната' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Оля' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Черга' })).toBeNull();
    expect(screen.getByText('Діє з наступного запитання')).toBeTruthy();
  });

  it('a tap picks a teammate for the next question', async () => {
    const { send } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:pick-answerer', { memberId: 'u3', scope: 'question' }));
  });

  it('with «на весь раунд» ticked the pick lasts the round', async () => {
    const { send } = mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'на весь раунд' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('Діє до кінця раунду')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:pick-answerer', { memberId: 'u3', scope: 'round' }));
  });

  it('with a pick waiting the switch resends the same person with the new scope', async () => {
    const { send } = mount({ answererPick: { memberId: 'u3', scope: 'question' } });
    expect(screen.getByRole('button', { name: 'Петро' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Я' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Діє з наступного запитання')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'на весь раунд' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:pick-answerer', { memberId: 'u3', scope: 'round' }));
  });

  it('a round pick shows the switch ticked', () => {
    mount({ answererPick: { memberId: 'u3', scope: 'round' } });
    expect((screen.getByRole('checkbox', { name: 'на весь раунд' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Діє до кінця раунду')).toBeTruthy();
  });

  it('a picked teammate who went offline still shows', () => {
    mount({ answererPick: { memberId: 'u4', scope: 'round' } });
    expect(screen.getByRole('button', { name: 'Ната' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('in chosen «Я» clears the pick', async () => {
    const { send } = mount({ answererPick: { memberId: 'u3', scope: 'question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Я' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:pick-answerer', { memberId: null, scope: 'question' }));
  });

  it('in turns «Черга» clears the pick and «Я» picks me', async () => {
    const { send } = mount({ answererMode: 'rotate' });
    expect(screen.getByRole('button', { name: 'Черга' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Я' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Я' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:pick-answerer', { memberId: 'u2', scope: 'question' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Черга' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Черга' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:pick-answerer', { memberId: null, scope: 'question' }));
  });

  it('a pause does not block the pick (it is between questions)', () => {
    render(<AnswererPicker view={teamPlayerView({ phase: 'intro', paused: true }, { answererMode: 'chosen', canPickAnswerer: true })} send={vi.fn()} onError={() => undefined} />);
    expect((screen.getByRole('button', { name: 'Петро' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a refusal goes to onError', async () => {
    const { onError } = mount({}, vi.fn().mockResolvedValue({ ok: false, error: 'wrong_phase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Петро' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Зараз цього зробити не можна.'));
  });
});
