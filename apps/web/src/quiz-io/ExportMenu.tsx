import { useRef, useState, type JSX } from 'react';
import { countText, errorText, t } from '../i18n';
import type { IoProgress } from './actions';

/** Текст прогресу дії (однаковий в експорті й імпорті). */
export function progressText(progress: IoProgress): string {
  switch (progress.stage) {
    case 'media':
      return t('ioMedia', { done: progress.done, total: progress.total });
    case 'wait':
      return t('ioWaitLimit');
    case 'checking':
      return t('ioChecking');
    case 'creating':
      return t('ioCreating');
    default:
      return t('ioPreparing');
  }
}

/** «Експорт» однієї вікторини: файл вікторини чи таблиця. Модулі quiz-io вантажаться лише при натисканні. */
export function ExportMenu({ quizId, disabled }: { quizId: string; disabled?: boolean }): JSX.Element {
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IoProgress | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'file' | 'table') => {
    if (busy) return;
    if (menu.current !== null) menu.current.open = false;
    setBusy(true);
    setError(null);
    setSkipped(0);
    setProgress({ stage: 'preparing' });
    try {
      const io = await import('./actions');
      if (kind === 'file') {
        const result = await io.exportQuizFile(quizId, setProgress);
        if (!result.ok && 'error' in result) setError(errorText(result.error));
      } else {
        const result = await io.exportQuizTable(quizId);
        if (!result.ok && 'error' in result) setError(errorText(result.error));
        else if (result.ok) setSkipped(result.skipped);
      }
    } catch {
      setError(errorText('network'));
    }
    setProgress(null);
    setBusy(false);
  };

  return (
    <div className="io-export-wrap">
      <details ref={menu} className="io-export">
        <summary className="btn" aria-disabled={disabled === true || busy}>
          {t('ioExport')}
        </summary>
        <div className="io-export-menu">
          <button type="button" className="btn" disabled={disabled === true || busy} onClick={() => void run('file')}>
            {t('ioExportFile')}
          </button>
          <button type="button" className="btn" disabled={disabled === true || busy} onClick={() => void run('table')}>
            {t('ioExportTable')}
          </button>
        </div>
      </details>
      {busy && progress !== null && (
        <p className="meta io-status" role="status">
          {progressText(progress)}
        </p>
      )}
      {!busy && skipped > 0 && <p className="meta io-status">{countText('ioSkipped', skipped, { count: skipped })}</p>}
      {error !== null && (
        <p className="error io-status" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
