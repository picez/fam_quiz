import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LOCALES, type LibraryMine, type Locale } from '@quiz/shared';
import type { QuizSummary } from '../api';
import { HelpButton } from '../help/HelpButton';
import { errorText, t } from '../i18n';
import { currentLocale } from '../locales/current';
import { LOCALE_NAMES } from '../locales/locales';
import { appealLibrary, closeInLibrary, myLibrary, openInLibrary } from './library-api';

/** Рядок стану запису: відкрито, закрито, тимчасово приховано (скарги) чи приховано модератором. */
export function libraryStatusText(entry: LibraryMine): string {
  if (entry.moderation === 'hidden') return t('libraryStatusHidden');
  if (entry.moderation === 'auto_hidden') return t('libraryStatusAuto');
  return entry.listed ? t('libraryStatusOpen') : t('libraryStatusClosed');
}

/**
 * Аркуш «📚 Відкрити для всіх»: попередження про особисте перед першим відкриттям, мова вікторини, відкрити / оновити / закрити,
 * один раз оскаржити приховування. Стан після дії береться окремим запитом; не вдався він — береться очікуваний стан після дії.
 */
export function LibraryShare({
  quiz,
  entry,
  onClose,
  onChanged,
}: {
  quiz: QuizSummary;
  entry: LibraryMine | null;
  onClose: () => void;
  onChanged: (entry: LibraryMine | null) => void;
}) {
  const [current, setCurrent] = useState<LibraryMine | null>(entry);
  const [language, setLanguage] = useState<Locale>(entry?.language ?? currentLocale());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const languageId = useId();
  const navigate = useNavigate();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Поки запит іде, аркуш не закривається: відповідь має куди прийти.
  const busyRef = useRef(false);
  const close = () => {
    if (!busyRef.current) onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Фокус іде в аркуш і повертається на кнопку, що його відкрила.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => trigger?.focus();
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('.help-pop') === null) closeRef.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);

  /**
   * Виконує дію і підтягує свіжий стан запису; помилка дії лишається в аркуші, сесія скінчилась — на вхід.
   * Дія вдалася, а свіжий стан не прочитався — «Мої вікторини» отримують очікуваний стан (expected), а не старий.
   */
  const act = async (action: () => Promise<{ ok: true; expected: LibraryMine } | { ok: false; error: string }>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const done = await action();
    const fresh = done.ok ? await myLibrary() : null;
    busyRef.current = false;
    setBusy(false);
    if (!done.ok) {
      if (done.error === 'unauthorized') navigate('/login?next=%2Fquizzes', { replace: true });
      else setError(errorText(done.error));
      return;
    }
    const mine = fresh !== null && fresh.ok ? (fresh.data.find((one) => one.quizId === quiz.id) ?? null) : done.expected;
    setCurrent(mine);
    onChanged(mine);
  };

  const open = () =>
    act(async () => {
      const result = await openInLibrary(quiz.id, language);
      if (!result.ok) return result;
      const base: LibraryMine = current ?? { quizId: quiz.id, entryId: result.data.entryId, listed: true, moderation: 'ok', appealed: false, appealOpen: false, language, updatedAt: '', likes: 0, plays: 0 };
      return { ok: true as const, expected: { ...base, entryId: result.data.entryId, listed: true, moderation: 'ok', language, updatedAt: new Date().toISOString() } };
    });
  const remove = () => {
    if (current === null || !window.confirm(t('libraryCloseConfirm'))) return;
    const before = current;
    void act(async () => {
      const result = await closeInLibrary(quiz.id);
      return result.ok ? { ok: true as const, expected: { ...before, listed: false } } : result;
    });
  };
  const appeal = () => {
    if (current === null) return;
    const before = current;
    void act(async () => {
      const result = await appealLibrary(quiz.id);
      if (!result.ok) return result;
      setSent(true);
      return { ok: true as const, expected: { ...before, appealed: true, appealOpen: true } };
    });
  };

  // Tab і Shift+Tab ходять колом усередині аркуша (aria-modal).
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = [...(cardRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])];
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

  const hidden = current?.moderation === 'hidden';
  const held = current?.moderation === 'auto_hidden';
  const isOpen = current !== null && current.listed && current.moderation === 'ok';
  // Закрити можна будь-коли, і під модерацією теж: інакше зняте приховування повернуло б вікторину проти волі автора.
  const canClose = current?.listed === true;
  // Відкрити чи оновити можна, поки модератор нічого не приховав.
  const canOpen = !hidden && !held;

  return createPortal(
    <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('libraryShareTitle')} tabIndex={-1} onClick={close} onKeyDown={onKeyDown}>
      <div ref={cardRef} className="table-card autopilot-card challenge-sheet library-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="autopilot-head">
          <h2>{t('libraryShareTitle')}</h2>
          <HelpButton id="setting.library" />
        </div>
        <p className="meta" dir="auto">
          {quiz.title}
        </p>

        {current === null && <p className="warning library-warning">{t('libraryShareWarning')}</p>}
        {current !== null && (
          <p className="meta" role="status">
            {libraryStatusText(current)}
          </p>
        )}
        {isOpen && <p className="meta">{t('librarySnapshotHint')}</p>}

        {canOpen && (
          <div className="field">
            <label htmlFor={languageId}>{t('libraryShareLanguage')}</label>
            <select id={languageId} value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value as Locale)}>
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_NAMES[locale]}
                </option>
              ))}
            </select>
          </div>
        )}

        {(sent || (hidden && current?.appealed === true)) && <p className="meta">{sent ? t('libraryAppealSent') : t('libraryAppealUsed')}</p>}

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="autopilot-actions">
          {canOpen && (
            <button type="button" className={isOpen ? 'btn' : 'btn btn-primary'} disabled={busy} onClick={() => void open()}>
              {isOpen ? t('libraryUpdate') : t('libraryOpen')}
            </button>
          )}
          {canClose && (
            <button type="button" className="btn" disabled={busy} onClick={remove}>
              {t('libraryClose')}
            </button>
          )}
          {hidden && !sent && current?.appealed === false && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={appeal}>
              {t('libraryAppeal')}
            </button>
          )}
          <button ref={cancelRef} type="button" className="btn" onClick={close} disabled={busy}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
