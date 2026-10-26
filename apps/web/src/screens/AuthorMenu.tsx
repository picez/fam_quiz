import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerView, TeamForm } from '@quiz/shared';
import { HelpButton } from '../help/HelpButton';
import { errorText, t, type TextKey } from '../i18n';
import type { Send } from '../live/types';
import { HostCloud } from './HostCloud';

type Screen = 'main' | 'kick' | 'teams' | 'hide';

/** Форми, які автор обирає сам; «Розподіляю сам» в автопілоті — випадковий розподіл у мить старту, тож окремої кнопки немає. */
const AUTHOR_FORMS: TeamForm[] = ['pick', 'random', 'dice'];

/**
 * «⋯» у шапці автора (11h): кнопка не вища за рядок шапки; аркуш як «Таблиця» з пунктами за етапом (план 11h).
 * Портал, role="dialog", Escape і дотик повз картку закривають, фокус повертається на «⋯». Нічого поза AuthorView: ні балів, ні ключа.
 */
export function AuthorMenu({ view, send }: { view: PlayerView; send: Send }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>('main');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);

  const author = view.author;
  const lobby = view.phase === 'lobby';
  const canHide = author !== null && (author.cloud !== null || author.bluff !== null);

  const close = () => {
    setOpen(false);
    setScreen('main');
    setError(null);
  };
  const go = (next: Screen) => {
    setScreen(next);
    setError(null);
  };

  // Фокус: при відкритті й зміні екрана — на перший доступний пункт; після закриття — назад на «⋯».
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      focusable(cardRef.current)[0]?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open, screen]);
  // Escape закриває, поки аркуш відкрито; відкриту довідку ⓘ Escape закриває першою.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.help-pop') !== null) return;
      close();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  // Етап «хмари» чи вибору блефу минув — екран «Приховати…» повертається на головний.
  useEffect(() => {
    if (screen === 'hide' && !canHide) go('main');
  }, [screen, canHide]);

  if (author === null || view.phase === 'finished') return null;

  /** Один запит за раз; помилка — у рядку аркуша (refused — свій текст для not_allowed). */
  const run = async (event: Parameters<Send>[0], payload?: unknown, refused?: TextKey): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const result = await send(event, payload);
      if (result.ok) {
        setError(null);
        return true;
      }
      setError(refused !== undefined && result.error === 'not_allowed' ? t(refused) : errorText(result.error));
      return false;
    } catch {
      setError(errorText('unknown'));
      return false;
    } finally {
      busy.current = false;
    }
  };
  const runAndClose = (event: Parameters<Send>[0]) => {
    void run(event).then((ok) => {
      if (ok) close();
    });
  };

  // Tab і Shift+Tab ходять колом по доступних кнопках аркуша.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = focusable(cardRef.current);
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
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const title: Record<Screen, TextKey> = { main: 'authorMenu', kick: 'authorKick', teams: 'teamFormLabel', hide: 'authorHide' };
  const back = (
    <button type="button" className="btn btn-small btn-quiet" onClick={() => go('main')}>
      {t('authorBack')}
    </button>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="table-button author-menu-btn"
        aria-label={t('authorMenu')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('authorMenu')} tabIndex={-1} onClick={onBackdrop} onKeyDown={onKeyDown}>
            <div ref={cardRef} className="table-card author-menu-card">
              <h2>{t(title[screen])}</h2>

              {screen === 'main' && (
                <div className="author-menu-items">
                  {!lobby && (
                    <button type="button" className="author-menu-item" onClick={() => runAndClose(view.paused ? 'host:resume' : 'host:pause')}>
                      {t(view.paused ? 'authorResume' : 'authorPause')}
                    </button>
                  )}
                  <button type="button" className="author-menu-item" onClick={() => go('kick')}>
                    {t('authorKick')}
                  </button>
                  {lobby && view.teams !== null && (
                    <button type="button" className="author-menu-item" onClick={() => go('teams')}>
                      {t('teamFormLabel')}
                    </button>
                  )}
                  {canHide && (
                    <button type="button" className="author-menu-item" onClick={() => go('hide')}>
                      {t('authorHide')}
                    </button>
                  )}
                  {!lobby && (
                    <button
                      type="button"
                      className="author-menu-item is-danger"
                      onClick={() => {
                        if (window.confirm(t('endConfirm'))) runAndClose('host:end');
                      }}
                    >
                      {t('authorEnd')}
                    </button>
                  )}
                </div>
              )}

              {screen === 'kick' && (
                <>
                  {author.people.length === 0 ? (
                    <p className="meta">{t('authorKickNone')}</p>
                  ) : (
                    <ul className="author-menu-people">
                      {author.people.map((person) => (
                        <li key={person.id}>
                          <button
                            type="button"
                            className={person.connected ? 'author-menu-item' : 'author-menu-item is-away'}
                            onClick={() => {
                              if (window.confirm(t('kickConfirm', { name: person.nickname }))) void run('host:kick', { playerId: person.id });
                            }}
                          >
                            <span>{person.nickname}</span>
                            {!person.connected && <span className="author-menu-note">{t('authorAway')}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {back}
                </>
              )}

              {screen === 'teams' && view.teams !== null && (
                <>
                  <ul className="author-menu-forms">
                    {AUTHOR_FORMS.map((form) => (
                      <li key={form}>
                        <button
                          type="button"
                          className="author-menu-item"
                          aria-pressed={view.teams?.form === form}
                          onClick={() => void run('host:team-form', { form })}
                        >
                          {t(`teamForm_${form}` as TextKey)}
                        </button>
                        <HelpButton id={`team.${form}`} />
                      </li>
                    ))}
                  </ul>
                  {back}
                </>
              )}

              {screen === 'hide' && (
                <>
                  {author.cloud !== null && (
                    <>
                      <p className="meta">{t('authorHideCloudHint')}</p>
                      <HostCloud words={author.cloud} onHide={(key, hidden) => void run('host:cloud-hide', { key, hidden })} />
                    </>
                  )}
                  {author.bluff !== null && (
                    <>
                      <p className="meta">{t('authorHideBluffHint')}</p>
                      <ul className="author-menu-people">
                        {author.bluff.map((option) => (
                          <li key={option.id}>
                            <button
                              type="button"
                              className="author-menu-item"
                              aria-label={t('bluffRemoveLabel', { text: option.text })}
                              onClick={() => {
                                if (window.confirm(t('bluffRemoveConfirm', { text: option.text }))) {
                                  void run('host:bluff-remove', { optionId: option.id }, 'authorBluffRefused');
                                }
                              }}
                            >
                              {option.text}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {back}
                </>
              )}

              {error !== null && (
                <p className="author-menu-error" role="alert">
                  {error}
                </p>
              )}
              <button type="button" className="btn btn-small" onClick={close}>
                {t('buffHelpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Доступні для фокуса кнопки аркуша, у порядку документа. */
function focusable(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])];
}
