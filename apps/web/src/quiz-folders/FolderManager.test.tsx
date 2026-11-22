// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QuizFolder } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { createFolder, deleteFolder, listFolders, renameFolder, reorderFolders } from './folder-api';
import { FolderManager } from './FolderManager';

vi.mock('./folder-api', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  reorderFolders: vi.fn(),
  deleteFolder: vi.fn(),
  moveQuizToFolder: vi.fn(),
}));

const folder = (id: string, name: string, position: number): QuizFolder => ({ id, name, position, createdAt: '2026-11-01T10:00:00.000Z' });
const asya = folder('f1', 'Для Асі', 0);
const kino = folder('f2', 'Кіно', 1);
const sport = folder('f3', 'Спорт', 2);

/** Панель з власним станом списку, як на сторінці: onChanged замінює категорії. */
function mount(initial: QuizFolder[]) {
  const onChanged = vi.fn();
  const view = render(<FolderManager folders={initial} onChanged={onChanged} />);
  onChanged.mockImplementation((next: QuizFolder[]) => view.rerender(<FolderManager folders={next} onChanged={onChanged} />));
  return onChanged;
}

const newField = () => screen.getByRole('textbox', { name: t('quizFolderNewLabel') }) as HTMLInputElement;
const addButton = () => screen.getByRole('button', { name: t('quizFolderAdd') }) as HTMLButtonElement;
const rowOf = (name: string) => screen.getByDisplayValue(name).closest('li')!;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FolderManager (73)', () => {
  it('explains the folders and suggests the first one when there are none', () => {
    mount([]);
    expect(screen.getByText(t('quizFoldersHint'))).toBeTruthy();
    expect(screen.getByText(t('quizFoldersEmpty'))).toBeTruthy();
  });

  it('adds a folder: the field is cleared and the folder appears; the button waits for a name', async () => {
    vi.mocked(createFolder).mockResolvedValue({ ok: true, data: kino });
    const onChanged = mount([asya]);
    expect(addButton().disabled).toBe(true);
    fireEvent.change(newField(), { target: { value: 'Кіно' } });
    expect(addButton().disabled).toBe(false);
    fireEvent.click(addButton());
    await waitFor(() => expect(newField().value).toBe(''));
    expect(createFolder).toHaveBeenCalledWith('Кіно');
    expect(onChanged).toHaveBeenCalledWith([asya, kino]);
    expect(screen.getByDisplayValue('Кіно')).toBeTruthy();
    expect(newField().maxLength).toBe(40);
  });

  it('keeps the name and explains a taken name', async () => {
    vi.mocked(createFolder).mockResolvedValue({ ok: false, error: 'folder_name_taken' });
    mount([asya]);
    fireEvent.change(newField(), { target: { value: 'для асі' } });
    fireEvent.click(addButton());
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_folder_name_taken'));
    expect(newField().value).toBe('для асі');
  });

  it('shows the limit instead of the field at 30 folders', () => {
    mount(Array.from({ length: 30 }, (_, index) => folder(`f${index}`, `Категорія ${index}`, index)));
    expect(screen.queryByRole('textbox', { name: t('quizFolderNewLabel') })).toBeNull();
    expect(screen.getByText('Можна мати до 30 категорій.')).toBeTruthy();
  });

  it('renames: «Зберегти» waits for a changed name', async () => {
    vi.mocked(renameFolder).mockResolvedValue({ ok: true, data: { ...kino, name: 'Фільми' } });
    const onChanged = mount([asya, kino]);
    const row = rowOf('Кіно');
    const save = within(row).getByRole('button', { name: t('quizFolderSave') }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'Фільми' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith([asya, { ...kino, name: 'Фільми' }]));
    expect(renameFolder).toHaveBeenCalledWith('f2', 'Фільми');
  });

  it('moves a folder down and keeps the outer arrows disabled', async () => {
    vi.mocked(reorderFolders).mockResolvedValue({ ok: true, data: [kino, asya, sport] });
    const onChanged = mount([asya, kino, sport]);
    expect((screen.getByRole('button', { name: 'Вище: Для Асі' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Нижче: Спорт' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Вище: Кіно' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Нижче: Для Асі' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith([kino, asya, sport]));
    expect(reorderFolders).toHaveBeenCalledWith(['f2', 'f1', 'f3']);
  });

  it('re-reads the folders when they changed in another tab', async () => {
    vi.mocked(reorderFolders).mockResolvedValue({ ok: false, error: 'folders_changed' });
    vi.mocked(listFolders).mockResolvedValue({ ok: true, data: [asya, kino, sport] });
    const onChanged = mount([asya, kino]);
    fireEvent.click(screen.getByRole('button', { name: 'Нижче: Для Асі' }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_folders_changed'));
    expect(listFolders).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith([asya, kino, sport]);
  });

  it('deletes only after the confirm that the quizzes stay', async () => {
    vi.mocked(deleteFolder).mockResolvedValue({ ok: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChanged = mount([asya, kino]);
    fireEvent.click(within(rowOf('Кіно')).getByRole('button', { name: t('quizFolderDelete') }));
    expect(confirm).toHaveBeenCalledWith('Видалити категорію «Кіно»? Вікторини з неї не зникнуть — вони стануть «Без категорії».');
    expect(deleteFolder).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(within(rowOf('Кіно')).getByRole('button', { name: t('quizFolderDelete') }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith([asya]));
    expect(deleteFolder).toHaveBeenCalledWith('f2');
  });
});
