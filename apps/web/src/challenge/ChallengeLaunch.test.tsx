// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChallengeCheck, ChallengeMine } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChallenge, getChallengeCheck } from '../api';
import { countText, t } from '../i18n';
import { ChallengeLaunch, challengeUrl } from './ChallengeLaunch';

vi.mock('../api', () => ({
  getChallengeCheck: vi.fn(),
  createChallenge: vi.fn(),
}));

const quiz = { id: 'q1', title: 'Географія', description: '', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z', createdAt: '2026-10-12T10:00:00.000Z', folderId: null };
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
    check({
      skipped: { rounds: [{ index: 1, type: 'truth', reason: 'type' }], questions: [{ index: 0, count: 3 }, { index: 2, count: 1 }], settings: ['teams', 'debuffShop', 'audience', 'stealth'] },
      empty: false,
      active: null,
    });
    open();
    expect(await screen.findByText('Буде пропущено те, що потребує кількох гравців:')).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      t('challengeSkipRound', { index: 2, type: t('roundTypeTruth') }),
      'Раунд 1 (Класичний): буде пропущено 3 запитання',
      'Раунд 3 (Класичний): буде пропущено 1 запитання',
      'Командна гра',
      'Крамниця дебафів',
      'Бафи: Запитання в залі й Прихований напад',
    ]);
    expect(items[1]).toBe(countText('challengeSkipQuestions', 3, { index: 1, type: t('roundTypeClassic'), count: 3 }));
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

  it('after creating: no lead and no skipped list, «Закрити» instead of «Скасувати», nothing to replace', async () => {
    check({ skipped: { rounds: [], questions: [], settings: ['teams'] }, empty: false, active: null });
    vi.mocked(createChallenge).mockResolvedValue({ ok: true, data: mine });
    open();
    expect(await screen.findByText(t('challengeLead'))).toBeTruthy();
    fireEvent.click(await createButton());
    await screen.findByLabelText(t('challengeLink'));
    expect(screen.queryByText(t('challengeLead'))).toBeNull();
    expect(screen.queryByText(t('challengeSkipTitle'))).toBeNull();
    expect(screen.queryByRole('button', { name: t('challengeReplace') })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Скасувати' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Аркуш має власний клас, а не клас картки сторінки виклику.
    expect(document.querySelector('.challenge-sheet')).not.toBeNull();
    expect(document.querySelector('.challenge-card')).toBeNull();
  });

  it('an active challenge shows its link to copy and share again; «Новий виклик» is only a secondary action', async () => {
    check({ ...nothing, active: { ...mine, played: 2 } });
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    open();
    const field = (await screen.findByLabelText(t('challengeLink'))) as HTMLInputElement;
    expect(field.value).toBe(challengeUrl(mine.code));
    fireEvent.click(screen.getByRole('button', { name: t('challengeCopy') }));
    expect(await screen.findByText(t('challengeCopied'))).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(challengeUrl(mine.code));
    fireEvent.click(screen.getByRole('button', { name: t('challengeShare') }));
    expect(share).toHaveBeenCalledWith({ title: quiz.title, text: t('challengeShareText', { title: quiz.title }), url: challengeUrl(mine.code) });
    const replace = screen.getByRole('button', { name: t('challengeReplace') });
    expect(replace.classList.contains('btn-primary')).toBe(false);
    expect(createChallenge).not.toHaveBeenCalled();
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
    await waitFor(() => expect((screen.getByLabelText(t('challengeLink')) as HTMLInputElement).value).toBe(challengeUrl('zzzzzzzzzzzz')));
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
  it('the header has the ⓘ help; it opens the entry and Escape then closes only the help', async () => {
    open();
    await createButton();
    fireEvent.click(screen.getByRole('button', { name: t('helpOpen', { title: t('challengeTitle') }) }));
    const pop = document.querySelector('.help-pop');
    expect(pop).not.toBeNull();
    expect(pop!.textContent).toContain(t('challengeTitle'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
