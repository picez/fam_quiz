import { useEffect, useId, useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PrizeContent, PrizePlace } from '@quiz/shared';
import { t } from '../i18n';
import { TrophyView } from './TrophyView';
import { titleBadge } from './trophy-meta';

type Content = Omit<PrizeContent, 'name'>;

/** Чи є що роздивлятися: фото справжнього призу або 3D-трофей. */
export function canViewPrize(content: Content): boolean {
  return (content.real?.photoUrl ?? null) !== null || content.trophy !== null;
}

/**
 * Перегляд призу на весь екран (портал у body, модальний): фото справжнього призу великим, а без фото — 3D-трофей,
 * який можна крутити; під ним гравіювання, підпис і титул. Закривається ×, Escape і дотиком тла;
 * Tab ходить колом усередині, після закриття фокус повертається туди, де був до відкриття.
 * Назви призу тут немає: її бачить лише власник складу (publicContent).
 */
export function PrizeViewer({ content, place, onClose }: { content: Content; place: PrizePlace; onClose: () => void }): JSX.Element {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Свіжий onClose для слухача Escape без його перевстановлення.
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
      if (opener !== null && opener.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? [])];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const here = document.activeElement;
    if (event.shiftKey && (here === first || !dialogRef.current?.contains(here))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (here === last || !dialogRef.current?.contains(here))) {
      event.preventDefault();
      first.focus();
    }
  };

  const photo = content.real?.photoUrl ?? null;
  return createPortal(
    <>
      <div className="prize-view-backdrop" onClick={onClose} />
      <div ref={dialogRef} className="prize-view" role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={onKeyDown}>
        <div className="prize-view-head">
          <h2 id={headingId}>{t('prizeViewTitle', { place })}</h2>
          <button ref={closeRef} type="button" className="prize-view-close" aria-label={t('prizeViewClose')} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {photo !== null ? (
          <img className="prize-view-photo" src={photo} alt={content.real?.text ?? ''} />
        ) : (
          content.trophy && <TrophyView trophy={content.trophy} size="view" spin interactive />
        )}
        {content.engraving && <p className="engraving">{content.engraving}</p>}
        {content.real && <p className="prize-view-caption">{`🎁 ${content.real.text}`}</p>}
        {content.title && <p className="podium-title">{titleBadge(content.title)}</p>}
      </div>
    </>,
    document.body,
  );
}
