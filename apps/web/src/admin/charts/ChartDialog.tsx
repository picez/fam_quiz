import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import type { ChartView } from './BarChart';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]';

/**
 * 71: великий графік поверх сторінки (модальний): Esc і клік по тлу закривають, Tab ходить колом,
 * фокус — на «Закрити» при відкритті й назад на `returnTo` після. «Показати таблицею» міняє вигляд.
 */
export function ChartDialog({ title, caption, keysHint = false, returnTo, onClose, children }: { title: string; caption?: ReactNode; keysHint?: boolean; returnTo: RefObject<HTMLElement | null>; onClose: () => void; children: (view: ChartView, titleId: string) => ReactNode }): JSX.Element {
  const titleId = useId();
  const [view, setView] = useState<ChartView>('chart');
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    closeButton.current?.focus();
    const back = returnTo.current;
    return () => back?.focus();
  }, [returnTo]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);

  // Tab і Shift+Tab ходять колом усередині діалогу (aria-modal).
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = [...(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (event.shiftKey ? items.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next]!.focus();
  };

  return createPortal(
    <div className="chart-sheet" onClick={() => closeRef.current()} onKeyDown={onKeyDown}>
      <div ref={cardRef} className="chart-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="chart-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <div className="chart-dialog-actions">
            <button ref={closeButton} type="button" className="btn btn-small" onClick={() => closeRef.current()}>
              {t('chartClose')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setView((now) => (now === 'chart' ? 'table' : 'chart'))}>
              {view === 'chart' ? t('chartShowTable') : t('chartShowChart')}
            </button>
          </div>
        </div>
        {caption !== undefined && <div className="chart-dialog-caption">{caption}</div>}
        {keysHint && view === 'chart' && <p className="meta">{t('chartKeysHint')}</p>}
        {children(view, titleId)}
      </div>
    </div>,
    document.body,
  );
}
