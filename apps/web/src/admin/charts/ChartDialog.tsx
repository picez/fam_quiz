import { useEffect, useId, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import type { ChartView } from './BarChart';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]';

/**
 * 71: великий графік поверх сторінки (модальний): Esc і клік по тлу закривають, Tab ходить колом,
 * фокус — на «Закрити» при відкритті й назад на `returnTo` після. «Показати таблицею» міняє вигляд.
 * Поки діалог відкритий, решта сторінки — inert і не прокручується.
 */
export function ChartDialog({ title, caption, keysHint = false, returnTo, onClose, children }: { title: string; caption?: ReactNode; keysHint?: boolean; returnTo: RefObject<HTMLElement | null>; onClose: () => void; children: (view: ChartView, titleId: string) => ReactNode }): JSX.Element {
  const titleId = useId();
  const [view, setView] = useState<ChartView>('chart');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  /** Натиск почався на тлі: лише тоді відпускання на тлі закриває (виділення тексту, що вийшло за картку, — ні). */
  const downOnSheet = useRef(false);

  // Одним ефектом і в цьому порядку: спершу знімаємо inert, тоді фокус повертається (на inert-елемент він не став би).
  useEffect(() => {
    const sheet = sheetRef.current;
    const others = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== sheet && !node.hasAttribute('inert'));
    for (const node of others) node.setAttribute('inert', '');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const back = returnTo.current;
    return () => {
      for (const node of others) node.removeAttribute('inert');
      document.body.style.overflow = overflow;
      back?.focus();
    };
  }, [returnTo]);

  // Esc закриває; Tab і Shift+Tab ходять колом усередині діалогу (aria-modal) — на рівні документа,
  // бо після кліку в «порожнє» місце фокус на body, а не в діалозі.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? (event.shiftKey ? items.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next]!.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return createPortal(
    <div
      ref={sheetRef}
      className="chart-sheet"
      onMouseDown={(event) => {
        downOnSheet.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && downOnSheet.current) closeRef.current();
        downOnSheet.current = false;
      }}
    >
      <div ref={cardRef} className="chart-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
