import type { QuizFolder } from '@quiz/shared';
import { t } from '../i18n';

/** Що показує список: null — усі, 'none' — без категорії, інакше id категорії. */
export type FolderPick = string | null;

/** Чи лежить вікторина «без категорії»: її категорію могли щойно видалити. */
export const folderless = (folderId: string | null, folders: readonly QuizFolder[]): boolean =>
  folderId === null || !folders.some((one) => one.id === folderId);

/** Вікторини, які показує вибраний чип. */
export function filterByFolder<T extends { folderId: string | null }>(quizzes: readonly T[], folders: readonly QuizFolder[], pick: FolderPick): T[] {
  if (pick === null) return [...quizzes];
  if (pick === 'none') return quizzes.filter((quiz) => folderless(quiz.folderId, folders));
  return quizzes.filter((quiz) => quiz.folderId === pick);
}

interface Props {
  folders: readonly QuizFolder[];
  quizzes: readonly { folderId: string | null }[];
  pick: FolderPick;
  onPick: (pick: FolderPick) => void;
}

/** 73: чипи «Усі (N)», категорії в порядку автора й «Без категорії (N)» останнім. */
export function FolderFilter({ folders, quizzes, pick, onPick }: Props) {
  const count = (one: FolderPick) => filterByFolder(quizzes, folders, one).length;
  const chip = (one: FolderPick, label: string, key: string) => (
    <button key={key} type="button" className="btn quiz-folder-chip" aria-pressed={pick === one} onClick={() => onPick(one)} dir="auto">
      {label}
    </button>
  );
  return (
    <div className="quiz-folder-filter" role="group" aria-label={t('quizFoldersLabel')}>
      {chip(null, t('quizFolderAll', { count: quizzes.length }), 'all')}
      {folders.map((folder) => chip(folder.id, t('quizFolderChip', { name: folder.name, count: count(folder.id) }), folder.id))}
      {chip('none', t('quizFolderNone', { count: count('none') }), 'none')}
    </div>
  );
}
