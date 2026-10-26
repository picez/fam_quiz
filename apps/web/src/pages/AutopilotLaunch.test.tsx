// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AutopilotCheck } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutopilotGame, getAutopilotCheck, getMyProfile } from '../api';
import { t } from '../i18n';
import { loadAuthor, loadLastGame, loadPlayer } from '../storage';
import { AutopilotLaunch } from './AutopilotLaunch';

vi.mock('../api', () => ({
  getAutopilotCheck: vi.fn(),
  getMyProfile: vi.fn(),
  createAutopilotGame: vi.fn(),
}));

const quiz = { id: 'q1', title: 'Географія', description: '', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(getAutopilotCheck).mockResolvedValue({ ok: true, blocked: [], changed: [] });
  vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { nickname: 'Марта Авторка' } as never });
});
afterEach(cleanup);

const onClose = vi.fn();
const open = () =>
  render(
    <MemoryRouter initialEntries={['/quizzes']}>
      <Routes>
        <Route path="/quizzes" element={<AutopilotLaunch quiz={quiz} onClose={onClose} />} />
        <Route path="/play/:code" element={<p>гра</p>} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
    </MemoryRouter>,
  );
const create = () => screen.getByRole('button', { name: t('autopilotCreate') }) as HTMLButtonElement;
const ready = async () => {
  const input = (await screen.findByDisplayValue('Марта Авторка')) as HTMLInputElement;
  await waitFor(() => expect(create().disabled).toBe(false));
  return input;
};

describe('AutopilotLaunch', () => {
  it('lists the changes by round in the order of the check list and shows the honesty note', async () => {
    vi.mocked(getAutopilotCheck).mockResolvedValue({
      ok: true,
      blocked: [],
      changed: [
        { code: 'voice', rounds: [1] },
        { code: 'manual', rounds: [1, 2] },
      ],
    });
    open();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain(t('autopilotChange_voice'));
    expect(items[0]!.textContent).toContain('Раунд 2');
    expect(items[1]!.textContent).toContain(t('autopilotChange_manual'));
    expect(items[1]!.textContent).toContain('Раунди 2, 3');
    expect(screen.getByRole('note').textContent).toBe(t('autopilotHonest'));
  });

  it('says there are no changes', async () => {
    open();
    expect(await screen.findByText(t('autopilotNoChanges'))).toBeTruthy();
  });

  it('refuses a blocked quiz', async () => {
    vi.mocked(getAutopilotCheck).mockResolvedValue({ ok: true, blocked: [{ code: 'x', rounds: [0] }], changed: [] } as unknown as AutopilotCheck & { ok: true });
    open();
    expect(await screen.findByText(t('autopilotBlocked'))).toBeTruthy();
    expect(create().disabled).toBe(true);
  });

  it('keeps the button off while checking and when the check fails', async () => {
    vi.mocked(getAutopilotCheck).mockResolvedValue({ ok: false, error: 'not_found' });
    open();
    expect(screen.getByText(t('autopilotChecking'))).toBeTruthy();
    expect(create().disabled).toBe(true);
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_not_found'));
    expect(create().disabled).toBe(true);
  });

  it('creates the room with the edited profile nickname and goes to the game', async () => {
    vi.mocked(createAutopilotGame).mockResolvedValue({ ok: true, gameId: 'g', code: '123456', stageToken: 's', token: 't', playerId: 'p' });
    open();
    const input = await ready();
    fireEvent.change(input, { target: { value: 'Марта' } });
    fireEvent.click(create());
    expect(await screen.findByText('гра')).toBeTruthy();
    expect(createAutopilotGame).toHaveBeenCalledWith('q1', 'Марта');
    expect(loadPlayer('123456')).toBe('t');
    expect(loadAuthor('123456')).toEqual({ stageToken: 's' });
    expect(loadLastGame()).toBe('123456');
  });

  it('shows the server error and stays', async () => {
    vi.mocked(createAutopilotGame).mockResolvedValue({ ok: false, error: 'autopilot_blocked' });
    open();
    await ready();
    fireEvent.click(create());
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_autopilot_blocked'));
    expect(screen.queryByText('гра')).toBeNull();
  });

  it('sends an expired session to sign in', async () => {
    vi.mocked(createAutopilotGame).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    await ready();
    fireEvent.click(create());
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('needs at least two characters', async () => {
    open();
    const input = await ready();
    fireEvent.change(input, { target: { value: 'М' } });
    expect(create().disabled).toBe(true);
  });

  it('starts with an empty nickname when the profile cannot be read', async () => {
    vi.mocked(getMyProfile).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    await screen.findByText(t('autopilotNoChanges'));
    expect((screen.getByLabelText(t('autopilotNickname')) as HTMLInputElement).value).toBe('');
  });

  it('closes on Escape', async () => {
    open();
    await screen.findByText(t('autopilotNoChanges'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape with the ⓘ help open does not close the sheet', async () => {
    open();
    await screen.findByText(t('autopilotNoChanges'));
    const pop = document.createElement('div');
    pop.className = 'help-pop';
    document.body.append(pop);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    pop.remove();
  });

  it('a nickname error from the server is shown', async () => {
    vi.mocked(createAutopilotGame).mockResolvedValue({ ok: false, error: 'nickname_invalid' });
    open();
    await ready();
    fireEvent.click(create());
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_nickname_invalid'));
  });

  it('Tab and Shift+Tab stay inside the sheet', async () => {
    open();
    await ready();
    const dialog = screen.getByRole('dialog');
    const cancel = screen.getByRole('button', { name: t('cancel') });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    const first = document.activeElement as HTMLElement;
    expect(dialog.contains(first)).toBe(true);
    expect(first).not.toBe(cancel);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it('focus goes back to the button that opened the sheet', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const view = open();
    await ready();
    expect(document.activeElement).not.toBe(trigger);
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('the stage token never lands in the page', async () => {
    let finish: (value: { ok: true; gameId: string; code: string; stageToken: string; token: string; playerId: string }) => void = () => undefined;
    vi.mocked(createAutopilotGame).mockReturnValue(new Promise((resolve) => (finish = resolve)) as never);
    open();
    await ready();
    fireEvent.click(create());
    finish({ ok: true, gameId: 'g', code: '123456', stageToken: 'secret-stage-token', token: 't', playerId: 'p' });
    expect(await screen.findByText('гра')).toBeTruthy();
    expect(document.body.innerHTML).not.toContain('secret-stage-token');
  });

  it('a tap past the card or Escape while the room is being created does not close the sheet', async () => {
    vi.mocked(createAutopilotGame).mockReturnValue(new Promise(() => undefined) as never);
    open();
    await ready();
    fireEvent.click(create());
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
