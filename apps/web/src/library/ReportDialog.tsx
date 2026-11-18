import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { REPORT_REASONS, REPORT_TEXT_MAX, type ReportReason, type ReportTarget } from '@quiz/shared';
import { errorText, t, type TextKey } from '../i18n';
import { sendReport } from './library-api';

/** Скільки показуємо «Дякуємо» до автоматичного закриття. */
const CLOSE_AFTER_MS = 1500;

/**
 * Аркуш «Скарга»: причина (обов'язково) і необов'язкове пояснення до 300 символів.
 * Запит іде лише при натисканні «Надіслати» — відкриття сторінки з кнопкою нічого не вантажить.
 */
export function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(false);
  const close = () => {
    if (!busyRef.current) onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Фокус іде в аркуш і повертається на кнопку, що його відкрила.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstRef.current?.focus();
    return () => trigger?.focus();
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('.help-pop') === null) closeRef.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);

  useEffect(() => {
    if (!sent) return;
    // «Надіслати» зник разом із формою: фокус переходить на «Закрити», а не на <body>.
    doneRef.current?.focus();
    const timer = window.setTimeout(() => closeRef.current(), CLOSE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [sent]);

  const submit = async () => {
    if (reason === null || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const note = text.trim();
    const result = await sendReport({ target, reason, ...(note === '' ? {} : { text: note }) });
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    setSent(true);
  };

  // Tab і Shift+Tab ходять колом усередині аркуша (aria-modal).
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = [...(cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (event.shiftKey && (here === first || !cardRef.current?.contains(here))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (here === last || !cardRef.current?.contains(here))) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('reportTitle')} tabIndex={-1} onClick={close} onKeyDown={onKeyDown}>
      <div ref={cardRef} className="table-card autopilot-card challenge-sheet report-sheet" onClick={(event) => event.stopPropagation()}>
        <h2>{t('reportTitle')}</h2>
        {sent ? (
          <>
            <p role="status">{t('reportSent')}</p>
            <div className="autopilot-actions">
              <button ref={doneRef} type="button" className="btn btn-primary" onClick={close}>
                {t('reportClose')}
              </button>
            </div>
          </>
        ) : (
          <>
            <fieldset className="report-reasons" disabled={busy}>
              <legend>{t('reportReason')}</legend>
              {REPORT_REASONS.map((one, index) => (
                <div key={one} className="report-reason">
                  <input
                    ref={index === 0 ? firstRef : undefined}
                    id={`report-reason-${one}`}
                    type="radio"
                    name="report-reason"
                    value={one}
                    checked={reason === one}
                    onChange={() => setReason(one)}
                  />
                  <label htmlFor={`report-reason-${one}`}>{t(`reportReason_${one}` as TextKey)}</label>
                </div>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="report-text">{t('reportText')}</label>
              <textarea
                id="report-text"
                rows={3}
                dir="auto"
                maxLength={REPORT_TEXT_MAX}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value.slice(0, REPORT_TEXT_MAX))}
              />
              <span className="meta report-count" aria-hidden="true">
                {text.length}/{REPORT_TEXT_MAX}
              </span>
            </div>
            {error !== null && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="autopilot-actions">
              <button type="button" className="btn btn-primary" disabled={busy || reason === null} onClick={() => void submit()}>
                {t('reportSend')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={close}>
                {t('cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
