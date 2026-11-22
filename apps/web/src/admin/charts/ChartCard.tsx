import { useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { t } from '../../i18n';
import type { ChartSize, ChartView } from './BarChart';
import { ChartDialog } from './ChartDialog';

export interface ChartSlot {
  size: ChartSize;
  /** id заголовка, що називає графік (h3 картки або h2 діалогу). */
  titleId: string;
  view: ChartView;
}

/**
 * 71: картка графіка чи списку — h3, підказка, «Розгорнути». Рендер-проп малює малий вигляд у картці
 * й великий у діалозі; порожня картка кнопки не має.
 */
export function ChartCard({ title, hint, caption, empty, bars = true, children }: { title: string; hint?: ReactNode; caption?: ReactNode; empty: boolean; bars?: boolean; children: (slot: ChartSlot) => ReactNode }): JSX.Element {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  return (
    <figure className="chart-card">
      <div className="chart-card-head">
        <h3 id={titleId}>{title}</h3>
        {!empty && (
          <button ref={button} type="button" className="btn btn-small chart-expand" aria-label={t('chartExpand', { title })} onClick={() => setOpen(true)}>
            <span aria-hidden="true">⤢</span>
            <span aria-hidden="true">{t('chartExpandShort')}</span>
          </button>
        )}
      </div>
      {hint !== undefined && <p className="meta">{hint}</p>}
      {children({ size: 'small', titleId, view: 'chart' })}
      {open && (
        <ChartDialog
          title={title}
          caption={
            hint === undefined && caption === undefined ? undefined : (
              <>
                {caption !== undefined && <p className="meta">{caption}</p>}
                {hint !== undefined && <p className="meta">{hint}</p>}
              </>
            )
          }
          keysHint={bars}
          returnTo={button}
          onClose={() => setOpen(false)}
        >
          {(view, dialogTitleId) => children({ size: 'large', titleId: dialogTitleId, view })}
        </ChartDialog>
      )}
    </figure>
  );
}
