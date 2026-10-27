import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HostUndoTarget, UndoPanel, UndoRow } from '@quiz/shared';
import { roundLabel } from '../format';
import { HelpButton } from '../help/HelpButton';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';
import { activePlayers, roundRows, undoRowText, undoWho } from '../undo-panel';

/**
 * Кнопка «↶ Бали» і аркуш «Скасування балів» (12a); пояснення — план 12a, «Вигляд аркуша».
 * Одиночні дії — одним дотиком, масові — після підтвердження; дії йдуть по одній,
 * аркуш не закривається й оновлюється разом із view.undo.
 */
export function UndoButton({ undo, teams, send }: { undo: UndoPanel; teams: boolean; send: Send }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
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
  // Escape закриває аркуш, але відкриту довідку ⓘ — першою.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('.help-pop') === null) setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);

  const run = async (target: HostUndoTarget) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await send('host:undo', { target });
      if (result.ok) setError(null);
      else setError(result.error === 'not_allowed' ? t('undoNotAllowed') : errorText(result.error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const bulk = (message: string, target: HostUndoTarget) => {
    if (busyRef.current) return;
    if (window.confirm(message)) void run(target);
  };

  const rowList = (rows: UndoRow[]) => (
    <ul>
      {rows.map((row) => {
        const undone = row.undoneBy !== null;
        const text = undoRowText(row);
        return (
          <li key={JSON.stringify(row.target)} className={undone ? 'undo-row is-undone' : 'undo-row'}>
            <span className="undo-row-text">{undone ? <s>{text}</s> : text}</span>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => void run(row.undoneBy === null ? row.target : { seq: row.undoneBy })}
            >
              {t(undone ? 'redoOne' : 'undoOne')}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-small undo-button"
        aria-haspopup="dialog"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t('undoOpen')}
      </button>
      {open &&
        createPortal(
          <div className="table-sheet undo-sheet" role="dialog" aria-modal="true" aria-label={t('undoTitle')} tabIndex={-1} onClick={() => setOpen(false)}>
            <div className="table-card undo-card" onClick={(event) => event.stopPropagation()}>
              <div className="with-help">
                <h2>{t('undoTitle')}</h2>
                <HelpButton id="setting.undo" />
              </div>
              {error !== null && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {undo.rounds.length === 0 && <p className="meta undo-empty">{t('undoEmpty')}</p>}
              {undo.rounds.map((round) => {
                const roundWho = activePlayers(roundRows(round));
                return (
                  <section key={round.index} className="undo-round">
                    <div className="undo-round-head">
                      <h3>{roundLabel(round.title, round.index, round.type)}</h3>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={busy || roundWho === 0}
                        onClick={() => bulk(t('undoConfirmRound', { who: undoWho(roundWho, teams), round: round.index + 1 }), { round: round.index })}
                      >
                        {t('undoRoundAll')}
                      </button>
                    </div>
                    {round.questions.map((question) => {
                      const who = activePlayers(question.rows);
                      const title = `${question.number}. ${question.text}`;
                      return (
                        <div key={question.index} className="undo-question">
                          <div className="undo-question-head">
                            <h4 className="undo-question-title" title={title}>
                              {title}
                            </h4>
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={busy || who === 0}
                              onClick={() => bulk(t('undoConfirmQuestion', { who: undoWho(who, teams), question: question.number }), { question: question.index })}
                            >
                              {t('undoQuestionAll')}
                            </button>
                          </div>
                          {rowList(question.rows)}
                        </div>
                      );
                    })}
                    {round.loose.length > 0 && (
                      <div className="undo-question is-loose">
                        <h4 className="undo-question-title">{t('undoLoose')}</h4>
                        {rowList(round.loose)}
                      </div>
                    )}
                  </section>
                );
              })}
              <button ref={closeRef} type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                {t('buffHelpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
