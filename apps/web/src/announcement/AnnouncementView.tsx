import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { isAnnouncementUrl, type Announcement } from '@quiz/shared';
import { t } from '../i18n';

/**
 * 53: вигляд оголошення (без запитів): текст як текст, «Детальніше» і необов'язковий хрестик.
 * Посилання — лише https:// чи сторінка сайту (сервер уже перевірив; тут ще раз, перш ніж ставити в href).
 * `preview` (адмінка): звичайний div без орієнтира «Оголошення» і «Детальніше» без переходу — клік не кидає незбережену форму.
 */
export function AnnouncementView({ announcement, onClose, preview = false }: { announcement: Pick<Announcement, 'text' | 'url'>; onClose?: () => void; preview?: boolean }): JSX.Element {
  const { text, url } = announcement;
  const link = url !== null && isAnnouncementUrl(url) ? url : null;
  const body = (
    <>
      <p className="announce-text" dir="auto">
        {text}
      </p>
      {link !== null &&
        (preview ? (
          <span className="announce-more">{t('announceMore')}</span>
        ) : link.startsWith('/') ? (
          <Link className="announce-more" to={link}>
            {t('announceMore')}
          </Link>
        ) : (
          <a className="announce-more" href={link} target="_blank" rel="noopener noreferrer">
            {t('announceMore')}
          </a>
        ))}
      {onClose !== undefined && (
        <button type="button" className="announce-close" aria-label={t('announceClose')} onClick={onClose}>
          ×
        </button>
      )}
    </>
  );
  if (preview) return <div className="announce-banner">{body}</div>;
  return (
    <aside className="announce-banner" aria-label={t('announceLabel')}>
      {body}
    </aside>
  );
}
