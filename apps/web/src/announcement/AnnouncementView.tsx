import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import type { Announcement } from '@quiz/shared';
import { t } from '../i18n';

/** 53: вигляд оголошення (без запитів): текст як текст, «Детальніше» і необов'язковий хрестик. */
export function AnnouncementView({ announcement, onClose }: { announcement: Pick<Announcement, 'text' | 'url'>; onClose?: () => void }): JSX.Element {
  const { text, url } = announcement;
  return (
    <aside className="announce-banner" aria-label={t('announceLabel')}>
      <p className="announce-text" dir="auto">
        {text}
      </p>
      {url !== null &&
        (url.startsWith('/') ? (
          <Link className="announce-more" to={url}>
            {t('announceMore')}
          </Link>
        ) : (
          <a className="announce-more" href={url} target="_blank" rel="noopener noreferrer">
            {t('announceMore')}
          </a>
        ))}
      {onClose !== undefined && (
        <button type="button" className="announce-close" aria-label={t('announceClose')} onClick={onClose}>
          ×
        </button>
      )}
    </aside>
  );
}
