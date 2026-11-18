// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChallengeCheck, ChallengeMine } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChallenge, getChallengeCheck } from '../api';
import { t } from '../i18n';
import { ChallengeLaunch, challengeUrl } from './ChallengeLaunch';

vi.mock('../api', () => ({
  getChallengeCheck: vi.fn(),
  createChallenge: vi.fn(),
}));

const quiz = { id: 'q1', title: 'Географія', description: '', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z' };
const mine: ChallengeMine = { quizId: 'q1', code: 'abcdefghjkmn', expiresAt: '2026-11-25T10:00:00.000Z', played: 0 };
const nothing: ChallengeCheck = { skipped: { rounds: [], questions: [], settings: [] }, empty: false, active: null };

const onClose = vi.fn();
const onCreated = vi.fn();
const open = () =>
  render(
    <MemoryRouter>
      <ChallengeLaunch quiz={quiz} onClose={onClose} onCreated={onCreated} />
    </MemoryRouter>,
  );
const check = (value: ChallengeCheck) => vi.mocked(getChallengeCheck).mockResolvedValue({ ok: true, data: value });
const createButton = () => screen.findByRole('button', { name: t('challengeCreate') });

beforeEach(() => {
  vi.clearAllMocks();
  check(nothing);
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(cleanup);

describe('ChallengeLaunch', () => {
  it('shows what will be skipped', async () => {
    check({ skipped: { rounds: [{ index: 1, type: 'truth', reason: 'type' }], questions: [{ index: 0, count: 3 }], settings: ['teams'] }, empty: false, active: null });
    open();
    expect(await screen.findByText(t('challengeSkipTitle'))).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toContain(t('challengeSkipRound', { index: 2, type: t('roundTypeTruth') }));
    expect(items.some((text) => text!.includes(t('challengeSkipRound', { index: 1, type: t('roundTypeClassic') })) && text!.includes(t('questionCount', { count: 3 })))).toBe(true);
    expect(items).toContain(t('challengeSkipSetting_teams'));
  });

  it('says nothing needs skipping', async () => {
    open();
    expect(await screen.findByText(t('challengeSkipNone'))).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('an empty quiz cannot be challenged', async () => {
    check({ skipped: { rounds: [{ index: 0, type: 'truth', reason: 'type' }], questions: [], settings: [] }, empty: true, active: null });
    open();
    expect(await screen.findByText(t('challengeEmpty'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('challengeCreate') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('challengeReplace') })).toBeNull();
  });

  it('creates and shows the link', async () => {
    vi.mocked(createChallenge).mockResolvedValue({ ok: true, data: mine });
    open();
    fireEvent.click(await createButton());
    const field = (await screen.findByLabelText(t('challengeLink'))) as HTMLInputElement;
    expect(field.value).toBe(challengeUrl(mine.code));
    expect(field.value.endsWith('/challenge/abcdefghjkmn')).toBe(true);
    expect(createChallenge).toHaveBeenCalledWith('q1');
    expect(onCreated).toHaveBeenCalledWith(mine);
    fireEvent.click(screen.getByRole('button', { name: t('challengeCopy') }));
    expect(await screen.findByText(t('challengeCopied'))).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(challengeUrl(mine.code));
    expect(screen.getByRole('link', { name: t('challengeOpenResults') }).getAttribute('href')).toBe('/challenge/abcdefghjkmn');
  });

  it('tells the author when copying fails', async () => {
    vi.mocked(createChallenge).mockResolvedValue({ ok: true, data: mine });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'));
    open();
    fireEvent.click(await createButton());
    fireEvent.click(await screen.findByRole('button', { name: t('challengeCopy') }));
    expect(await screen.findByText(t('challengeCopyFailed'))).toBeTruthy();
  });

  it('share only where it exists', async () => {
    vi.mocked(createChallenge).mockResolvedValue({ ok: true, data: mine });
    open();
    fireEvent.click(await createButton());
    await screen.findByLabelText(t('challengeLink'));
    expect(screen.queryByRole('button', { name: t('challengeShare') })).toBeNull();
    cleanup();

    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    open();
    fireEvent.click(await createButton());
    fireEvent.click(await screen.findByRole('button', { name: t('challengeShare') }));
    expect(share).toHaveBeenCalledWith({ title: quiz.title, text: t('challengeShareText', { title: quiz.title }), url: challengeUrl(mine.code) });
  });

  it('a new challenge asks first', async () => {
    check({ ...nothing, active: mine });
    vi.mocked(createChallenge).mockResolvedValue({ ok: true, data: { ...mine, code: 'zzzzzzzzzzzz' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open();
    const button = await screen.findByRole('button', { name: t('challengeReplace') });
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(t('challengeReplaceConfirm'));
    expect(createChallenge).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(createChallenge).toHaveBeenCalledWith('q1'));
    expect(((await screen.findByLabelText(t('challengeLink'))) as HTMLInputElement).value).toBe(challengeUrl('zzzzzzzzzzzz'));
    confirm.mockRestore();
  });

  it('shows the server error and stays', async () => {
    vi.mocked(createChallenge).mockResolvedValue({ ok: false, error: 'challenge_empty' });
    open();
    fireEvent.click(await createButton());
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_challenge_empty'));
  });

  it('has an accessible dialog that takes focus', async () => {
    open();
    expect(screen.getByRole('dialog', { name: t('challengeTitle') })).toBeTruthy();
    await createButton();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: t('cancel') }));
  });

  it('Escape closes, but not over open help', async () => {
    open();
    await createButton();
    const pop = document.createElement('div');
    pop.className = 'help-pop';
    document.body.append(pop);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    pop.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
