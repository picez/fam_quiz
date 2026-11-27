import { useEffect, useRef, useState, type JSX } from 'react';
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

/** Експорт однієї вікторини (77: спільний для «Експорт» і пунктів меню «⋯» картки): запуск, зайнятість і рядок стану. */
export function useQuizExport(quizId: string): { run: (kind: 'file' | 'table') => void; busy: boolean; status: JSX.Element | null } {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IoProgress | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Синхронна позначка: другий запуск до перемальовки не стартує.
  const running = useRef(false);

  const run = async (kind: 'file' | 'table') => {
    if (running.current) return;
    running.current = true;
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
    running.current = false;
  };

  const status =
    busy && progress !== null ? (
      <p className="meta io-status" role="status">
        {progressText(progress)}
      </p>
    ) : !busy && skipped > 0 ? (
      <p className="meta io-status">{countText('ioSkipped', skipped, { count: skipped })}</p>
    ) : error !== null ? (
      <p className="error io-status" role="alert">
        {error}
      </p>
    ) : null;

  return { run: (kind) => void run(kind), busy, status };
}

/** «Експорт» однієї вікторини: файл вікторини чи таблиця. Модулі quiz-io вантажаться лише при натисканні. */
export function ExportMenu({ quizId, disabled }: { quizId: string; disabled?: boolean }): JSX.Element {
  const menu = useRef<HTMLDetailsElement>(null);
  const exporter = useQuizExport(quizId);
  const busy = exporter.busy;

  // Відкрите меню закривається кліком поза ним і Escape.
  useEffect(() => {
    const close = (event: Event) => {
      const el = menu.current;
      if (el === null || !el.open) return;
      if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
      if (event.type === 'pointerdown' && el.contains(event.target as Node)) return;
      el.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  const run = (kind: 'file' | 'table') => {
    if (busy) return;
    if (menu.current !== null) menu.current.open = false;
    exporter.run(kind);
  };

  return (
    <div className="io-export-wrap">
      <details
        ref={menu}
        className="io-export"
        onToggle={(event) => {
          if (event.currentTarget.open) event.currentTarget.querySelector('.io-export-menu')?.scrollIntoView?.({ block: 'nearest' });
        }}
      >
        <summary
          className="btn"
          aria-disabled={disabled === true || busy}
          onClick={(event) => {
            if (disabled === true || busy) event.preventDefault();
          }}
        >
          {t('ioExport')}
        </summary>
        <div className="io-export-menu">
          <button type="button" className="btn" disabled={disabled === true || busy} onClick={() => run('file')}>
            {t('ioExportFile')}
          </button>
          <button type="button" className="btn" disabled={disabled === true || busy} onClick={() => run('table')}>
            {t('ioExportTable')}
          </button>
        </div>
      </details>
      {exporter.status}
    </div>
  );
}
