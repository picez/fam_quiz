import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerTable, TeamsView } from '@quiz/shared';
import { t } from '../i18n';
import { Standings } from './Standings';

/** Кнопка «Таблиця» в шапці й аркуш поверх екрана; закривається дотиком будь-де або Escape. */
export function TableButton({ table, meId, teams }: { table: PlayerTable; meId: string; teams?: TeamsView | null }) {
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
  // Escape закриває, поки аркуш відкрито, — навіть коли фокус уже вийшов з нього.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  // Єдина кнопка аркуша тримає фокус у ньому.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
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
          <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('tableTitle')} tabIndex={-1} onClick={() => setOpen(false)} onKeyDown={onKeyDown}>
            <div className="table-card">
              <h2>{t('tableTitle')}</h2>
              <Standings standings={table.rows} highlightId={meId} teams={teams} />
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
