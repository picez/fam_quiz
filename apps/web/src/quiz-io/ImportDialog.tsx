import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { HelpButton } from '../help/HelpButton';
import { errorText, t } from '../i18n';
import type { IoProgress } from './actions';
import { progressText } from './ExportMenu';

const SHOWN_ERRORS = 50;

/** «Імпорт вікторини»: файл .quiz чи таблиця → нова вікторина. Модулі quiz-io вантажаться лише при виборі файлу чи шаблону. */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IoProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const state = useRef({ busy, onClose });
  state.current = { busy, onClose };

  // Фокус — у діалог; після закриття — назад на те, що було активним (кнопка «Імпорт»).
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('.btn-primary')?.focus();
    return () => before?.focus();
  }, []);

  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.help-pop') !== null) return;
        event.preventDefault();
        event.stopPropagation();
        if (!state.current.busy) state.current.onClose();
        return;
      }
      if (event.key !== 'Tab' || dialog.current === null) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button')).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : index === focusable.length - 1 ? 0 : index + 1;
      event.preventDefault();
      focusable[next]!.focus();
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);

  const pick = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRowErrors([]);
    setProgress({ stage: 'checking' });
    try {
      const io = await import('./actions');
      const result = await io.importQuizFile(file, setProgress);
      if (result.ok) {
        onImported(result.id);
        return;
      }
      if ('errors' in result) setRowErrors(result.errors.map((row) => io.problemText(row)));
      else setError(errorText(result.error));
    } catch {
      setError(errorText('network'));
    }
    setProgress(null);
    setBusy(false);
  };

  const template = async () => {
    try {
      const io = await import('./actions');
      io.downloadTemplate();
    } catch {
      setError(errorText('network'));
    }
  };

  return createPortal(
    <div
      className="io-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div ref={dialog} className="io-dialog" role="dialog" aria-modal="true" aria-labelledby="io-dialog-title">
        <h2 id="io-dialog-title" className="io-dialog-title">
          {t('ioImportTitle')}
        </h2>
        <p className="meta">
          {t('ioImportHint')} <HelpButton id="setting.importExport" />
        </p>
        <input
          ref={input}
          type="file"
          className="io-file"
          accept=".quiz,.xlsx,.csv"
          tabIndex={-1}
          aria-label={t('ioChooseFile')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file !== undefined) void pick(file);
          }}
        />
        <div className="io-dialog-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
            {t('ioChooseFile')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void template()}>
            {t('ioTemplate')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            {t('ioClose')}
          </button>
        </div>
        {busy && progress !== null && (
          <p className="meta" role="status">
            {progressText(progress)}
          </p>
        )}
        {rowErrors.length > 0 && (
          <div className="io-errors-box">
            <p className="error">{t('ioErrorsTitle')}</p>
            <ul className="io-errors">
              {rowErrors.slice(0, SHOWN_ERRORS).map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
            {rowErrors.length > SHOWN_ERRORS && <p className="meta">{t('ioMoreErrors', { count: rowErrors.length - SHOWN_ERRORS })}</p>}
          </div>
        )}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
