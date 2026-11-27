import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import type { ChallengeMine, LibraryMine, QuizFolder } from '@quiz/shared';
import type { QuizSummary } from '../api';
import { daysLeftText, playedText } from '../challenge/challenge-text';
import { quizDatesText, quizSizeText } from '../format';
import { t } from '../i18n';
import { libraryStatusText } from '../library/LibraryShare';
import { useQuizExport } from '../quiz-io/ExportMenu';
import { folderless } from '../quiz-folders/FolderFilter';
import { ActionMenu } from '../ui/ActionMenu';

export interface QuizCardActions {
  onPlay: () => void;
  onAutopilot: () => void;
  onChallenge: () => void;
  onLibrary: () => void;
  onRemove: () => void;
  onMove: (folderId: string | null) => void;
}

/**
 * Картка у «Мої вікторини» (77): дві головні кнопки — «Провести» і «Змінити»,
 * решта дій (автопілот, виклик, бібліотека, експорт, видалити) — у меню «⋯».
 */
export function QuizCard({
  quiz,
  busy,
  library,
  challenges,
  folders,
  actions,
}: {
  quiz: QuizSummary;
  busy: boolean;
  library: LibraryMine[];
  challenges: ChallengeMine[];
  folders: QuizFolder[] | null;
  actions: QuizCardActions;
}): JSX.Element {
  const exporter = useQuizExport(quiz.id);
  return (
    <li className="panel">
      <div>
        <h2 dir="auto">{quiz.title}</h2>
        {quiz.description !== '' && (
          <p className="meta quiz-description" dir="auto">
            {quiz.description}
          </p>
        )}
        <p className="meta quiz-dates">
          <time dateTime={quiz.createdAt}>{quizDatesText(quiz)}</time>
        </p>
        <p className="meta">{quizSizeText(t('questionCount', { count: quiz.questionCount }), quiz.questionCount, quiz.truth)}</p>
        {library.map((one) => (
          <p className="meta library-line" key={one.entryId}>
            {libraryStatusText(one)}
          </p>
        ))}
        {challenges.map((one) => (
          <p className="meta challenge-line" key={one.code}>
            {t('challengeActive', { days: daysLeftText(one.expiresAt), played: playedText(one.played) })}{' '}
            <Link to={`/challenge/${one.code}`}>{t('challengeResultsLink')}</Link>
          </p>
        ))}
        {folders !== null && folders.length > 0 && (
          <label className="field quiz-folder-pick">
            <span>{t('quizFolderPick')}</span>
            <select value={folderless(quiz.folderId, folders) ? '' : quiz.folderId!} onChange={(event) => actions.onMove(event.target.value === '' ? null : event.target.value)}>
              <option value="">{t('quizFolderPickNone')}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id} dir="auto">
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="toolbar quiz-card-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={actions.onPlay}>
          {t('play')}
        </button>
        <Link className="btn" to={`/quizzes/${quiz.id}`}>
          {t('edit')}
        </Link>
        <ActionMenu
          label={t('quizMoreActions', { title: quiz.title })}
          disabled={busy}
          items={[
            { label: t('autopilotLaunch'), onSelect: actions.onAutopilot },
            { label: t('challengeButton'), onSelect: actions.onChallenge },
            { label: t('quizShareLibrary'), onSelect: actions.onLibrary },
            { label: t('quizExportFile'), onSelect: () => exporter.run('file'), disabled: exporter.busy },
            { label: t('quizExportTable'), onSelect: () => exporter.run('table'), disabled: exporter.busy },
            { label: t('remove'), onSelect: actions.onRemove, danger: true },
          ]}
        />
      </div>
      {exporter.status}
    </li>
  );
}
