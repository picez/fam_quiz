import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerTable } from '@quiz/shared';
import { t } from '../i18n';
import { Standings } from './Standings';

/** Кнопка «Таблиця» в шапці й аркуш поверх екрана; закривається дотиком будь-де або Escape. */
export function TableButton({ table, meId }: { table: PlayerTable; meId: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);
  // Escape закриває; єдина кнопка аркуша тримає фокус у ньому.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      closeRef.current?.focus();
    }
  };
  return (
    <>
      <button ref={triggerRef} type="button" className="table-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t('tableOpen')}
      </button>
      {open &&
        createPortal(
          <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('tableTitle')} onClick={() => setOpen(false)} onKeyDown={onKeyDown}>
            <div className="table-card">
              <h2>{t('tableTitle')}</h2>
              <Standings standings={table.rows} highlightId={meId} />
              {!table.full && <p className="meta">{t('tableOwnOnly')}</p>}
              <button ref={closeRef} type="button" className="btn btn-small">
                {t('buffHelpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
