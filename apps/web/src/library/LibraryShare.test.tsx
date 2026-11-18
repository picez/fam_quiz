// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryMine } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { appealLibrary, closeInLibrary, myLibrary, openInLibrary } from './library-api';
import { LibraryShare, libraryStatusText } from './LibraryShare';

vi.mock('./library-api', () => ({
  myLibrary: vi.fn(),
  openInLibrary: vi.fn(),
  closeInLibrary: vi.fn(),
  appealLibrary: vi.fn(),
}));

const quiz = { id: 'q1', title: 'Географія', description: '', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z' };
const entry = (over: Partial<LibraryMine> = {}): LibraryMine => ({
  quizId: 'q1',
  entryId: 'e1',
  listed: true,
  moderation: 'ok',
  appealed: false,
  appealOpen: false,
  language: 'uk',
  updatedAt: '2026-10-12T10:00:00.000Z',
  likes: 0,
  plays: 0,
  ...over,
});

const onClose = vi.fn();
const onChanged = vi.fn();
const open = (current: LibraryMine | null) => render(<LibraryShare quiz={quiz} entry={current} onClose={onClose} onChanged={onChanged} />);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(myLibrary).mockResolvedValue({ ok: true, data: [entry()] });
  vi.mocked(openInLibrary).mockResolvedValue({ ok: true, data: { entryId: 'e1' } });
  vi.mocked(closeInLibrary).mockResolvedValue({ ok: true });
  vi.mocked(appealLibrary).mockResolvedValue({ ok: true });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LibraryShare', () => {
  it('warns before the first opening, defaults the language to the current one and opens', async () => {
    open(null);
    expect(screen.getByText(t('libraryShareWarning')).textContent).toMatch(/^Вікторину побачать усі користувачі сайту/);
    expect((screen.getByLabelText(t('libraryShareLanguage')) as HTMLSelectElement).value).toBe('uk');
    fireEvent.change(screen.getByLabelText(t('libraryShareLanguage')), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: t('libraryOpen') }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(entry()));
    expect(openInLibrary).toHaveBeenCalledWith('q1', 'en');
  });

  it('opens in the current language by default', async () => {
    open(null);
    fireEvent.click(screen.getByRole('button', { name: t('libraryOpen') }));
    await waitFor(() => expect(openInLibrary).toHaveBeenCalledWith('q1', 'uk'));
  });

  it('shows the error text when the quiz is too short', async () => {
    vi.mocked(openInLibrary).mockResolvedValue({ ok: false, error: 'library_too_few' });
    open(null);
    fireEvent.click(screen.getByRole('button', { name: t('libraryOpen') }));
    expect((await screen.findByRole('alert')).textContent).toBe('Для бібліотеки потрібно щонайменше 5 запитань.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('updates an open entry and closes it after a confirmation, with no warning', async () => {
    open(entry());
    expect(screen.queryByText(t('libraryShareWarning'))).toBeNull();
    expect(screen.getByText(t('librarySnapshotHint'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('libraryUpdate') }));
    await waitFor(() => expect(openInLibrary).toHaveBeenCalledWith('q1', 'uk'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    vi.mocked(myLibrary).mockResolvedValue({ ok: true, data: [entry({ listed: false })] });
    fireEvent.click(screen.getByRole('button', { name: t('libraryClose') }));
    expect(window.confirm).toHaveBeenCalledWith(t('libraryCloseConfirm'));
    await waitFor(() => expect(closeInLibrary).toHaveBeenCalledWith('q1'));
    await waitFor(() => expect(onChanged).toHaveBeenLastCalledWith(entry({ listed: false })));
    expect(await screen.findByText(t('libraryStatusClosed'))).toBeTruthy();
    expect(screen.queryByText(t('libraryShareWarning'))).toBeNull();
    expect(screen.getByRole('button', { name: t('libraryOpen') })).toBeTruthy();
  });

  it('does not close when the confirmation is declined', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    open(entry());
    fireEvent.click(screen.getByRole('button', { name: t('libraryClose') }));
    expect(closeInLibrary).not.toHaveBeenCalled();
  });

  it('lets the author appeal a hidden quiz once', async () => {
    open(entry({ moderation: 'hidden' }));
    expect(screen.getByText('🚫 Приховано модератором')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('libraryUpdate') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('libraryAppeal') }));
    await waitFor(() => expect(appealLibrary).toHaveBeenCalledWith('q1'));
    expect(await screen.findByText('Оскарження надіслано')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('libraryAppeal') })).toBeNull();
  });

  it('shows a used appeal without a button', () => {
    open(entry({ moderation: 'hidden', appealed: true }));
    expect(screen.getByText('Оскарження вже використано')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('libraryAppeal') })).toBeNull();
  });

  it('shows a quiz held for review without actions', () => {
    open(entry({ moderation: 'auto_hidden' }));
    expect(screen.getByText('⏳ Тимчасово приховано: скарги на перевірці')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('libraryUpdate') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('libraryClose') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('libraryOpen') })).toBeNull();
  });

  it('shows the error of a refused appeal', async () => {
    vi.mocked(appealLibrary).mockResolvedValue({ ok: false, error: 'library_appeal_used' });
    open(entry({ moderation: 'hidden' }));
    fireEvent.click(screen.getByRole('button', { name: t('libraryAppeal') }));
    expect((await screen.findByRole('alert')).textContent).toBe('Оскарження вже використано.');
  });

  it('closes on Escape unless a help bubble is open, and not while busy', async () => {
    open(null);
    const help = document.createElement('div');
    help.className = 'help-pop';
    document.body.append(help);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    help.remove();
    let finish: (value: { ok: true; data: { entryId: string } }) => void = () => undefined;
    vi.mocked(openInLibrary).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole('button', { name: t('libraryOpen') }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    finish({ ok: true, data: { entryId: 'e1' } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('puts focus on Cancel', () => {
    open(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: t('cancel') }));
  });
});

describe('libraryStatusText', () => {
  it('names the four states', () => {
    expect(libraryStatusText(entry())).toBe(t('libraryStatusOpen'));
    expect(libraryStatusText(entry({ listed: false }))).toBe(t('libraryStatusClosed'));
    expect(libraryStatusText(entry({ moderation: 'auto_hidden' }))).toBe(t('libraryStatusAuto'));
    expect(libraryStatusText(entry({ moderation: 'hidden' }))).toBe(t('libraryStatusHidden'));
  });
  it('the header has the ⓘ help with the library entry', () => {
    open(null);
    fireEvent.click(screen.getByRole('button', { name: t('helpOpen', { title: 'Бібліотека вікторин' }) }));
    const pop = document.querySelector('.help-pop');
    expect(pop).not.toBeNull();
    expect(pop!.textContent).toContain('Бібліотека вікторин');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
