import { useState, type FormEvent } from 'react';
import { QUIZ_FOLDER_LIMITS, type QuizFolder } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { createFolder, deleteFolder, listFolders, renameFolder, reorderFolders } from './folder-api';

interface Props {
  folders: readonly QuizFolder[];
  /** Новий список категорій після кожної успішної дії (і після перечитування). */
  onChanged: (folders: QuizFolder[]) => void;
}

/** 73: панель «Керувати категоріями» — додати, перейменувати, «вище/нижче», видалити. */
export function FolderManager({ folders, onChanged }: Props) {
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Одна дія за раз; помилку показує під панеллю. */
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const code = await action();
    if (code !== null) setError(errorText(code));
    setBusy(false);
  };

  // Набір категорій змінився в іншій вкладці — перечитати, щоб наступна спроба мала свіжий список.
  const refresh = async () => {
    const fresh = await listFolders();
    if (fresh.ok) onChanged(fresh.data);
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    void run(async () => {
      const result = await createFolder(name);
      if (!result.ok) return result.error;
      setName('');
      onChanged([...folders, result.data]);
      return null;
    });
  };

  const rename = (folder: QuizFolder) =>
    run(async () => {
      const result = await renameFolder(folder.id, drafts[folder.id] ?? folder.name);
      if (!result.ok) {
        if (result.error === 'not_found') await refresh();
        return result.error;
      }
      setDrafts(({ [folder.id]: _done, ...rest }) => rest);
      onChanged(folders.map((one) => (one.id === folder.id ? result.data : one)));
      return null;
    });

  const move = (index: number, by: -1 | 1) =>
    run(async () => {
      const ids = folders.map((one) => one.id);
      [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!];
      const result = await reorderFolders(ids);
      if (!result.ok) {
        if (result.error === 'folders_changed') await refresh();
        return result.error;
      }
      onChanged(result.data);
      return null;
    });

  const remove = (folder: QuizFolder) => {
    if (!window.confirm(t('quizFolderDeleteConfirm', { name: folder.name }))) return;
    void run(async () => {
      const result = await deleteFolder(folder.id);
      if (!result.ok) {
        if (result.error === 'not_found') await refresh();
        return result.error;
      }
      onChanged(folders.filter((one) => one.id !== folder.id));
      return null;
    });
  };

  return (
    <section className="panel quiz-folder-manager" aria-label={t('quizFoldersManage')}>
      <p className="meta">{t('quizFoldersHint')}</p>
      {folders.length >= QUIZ_FOLDER_LIMITS.perOwner ? (
        <p className="meta">{t('quizFoldersLimit', { max: QUIZ_FOLDER_LIMITS.perOwner })}</p>
      ) : (
        <form className="quiz-folder-row" onSubmit={add}>
          <label className="field quiz-folder-name">
            <span>{t('quizFolderNewLabel')}</span>
            <input value={name} maxLength={QUIZ_FOLDER_LIMITS.nameMax} autoComplete="off" dir="auto" onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ''}>
            {t('quizFolderAdd')}
          </button>
        </form>
      )}
      {folders.length === 0 ? (
        <p className="meta">{t('quizFoldersEmpty')}</p>
      ) : (
        <ul className="quiz-folder-list">
          {folders.map((folder, index) => {
            const draft = drafts[folder.id] ?? folder.name;
            return (
              <li className="quiz-folder-row" key={folder.id}>
                <label className="field quiz-folder-name">
                  <span className="sr-only">{t('quizFolderNameLabel')}</span>
                  <input
                    value={draft}
                    maxLength={QUIZ_FOLDER_LIMITS.nameMax}
                    autoComplete="off"
                    dir="auto"
                    onChange={(event) => setDrafts((all) => ({ ...all, [folder.id]: event.target.value }))}
                  />
                </label>
                <button type="button" className="btn" disabled={busy || draft.trim() === '' || draft === folder.name} onClick={() => void rename(folder)}>
                  {t('quizFolderSave')}
                </button>
                <button type="button" className="btn" aria-label={t('quizFolderUp', { name: folder.name })} disabled={busy || index === 0} onClick={() => void move(index, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={t('quizFolderDown', { name: folder.name })}
                  disabled={busy || index === folders.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(folder)}>
                  {t('quizFolderDelete')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
