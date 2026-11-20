import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { t } from '../i18n';

const reportUrl = (path: string) => `/report?from=${encodeURIComponent(path)}`;

interface Props {
  className?: string;
  /** З екрана гри — нова вкладка: сокет гри не рветься. */
  newTab?: boolean;
}

/** «Повідомити про проблему» (64): веде на /report і передає, з якої сторінки людина прийшла (лише шлях). */
export function ProblemLink({ className = 'problem-link', newTab = false }: Props): JSX.Element {
  // Екрани гри малюються й поза роутером (тести пульта), тож шлях там береться з адреси вкладки.
  if (newTab) {
    return (
      <a className={className} href={reportUrl(window.location.pathname)} target="_blank" rel="noopener">
        {t('problemLink')}
      </a>
    );
  }
  return <RouterProblemLink className={className} />;
}

function RouterProblemLink({ className }: { className: string }): JSX.Element {
  const location = useLocation();
  return (
    <Link className={className} to={reportUrl(location.pathname)}>
      {t('problemLink')}
    </Link>
  );
}
