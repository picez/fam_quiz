import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ProblemGameInput } from '@quiz/shared';
import { t } from '../i18n';
import { saveMoment } from './problem-moment';

const reportUrl = (path: string) => `/report?from=${encodeURIComponent(path)}`;

interface Props {
  className?: string;
  /** З екрана гри — нова вкладка: сокет гри не рветься. */
  newTab?: boolean;
  /** З екрана гри: момент гри, який запам'ятовується в мить кліку (70). */
  moment?: () => ProblemGameInput | null;
}

/** «Повідомити про проблему» (64): веде на /report і передає, з якої сторінки людина прийшла (лише шлях). */
export function ProblemLink({ className = 'problem-link', newTab = false, moment }: Props): JSX.Element {
  // Екрани гри малюються й поза роутером (тести пульта), тож шлях там береться з адреси вкладки.
  if (newTab) {
    return (
      <a className={className} href={reportUrl(window.location.pathname)} target="_blank"
        rel="noopener"
        onClick={() => {
          const game = moment?.() ?? null;
          if (game !== null) saveMoment(game);
        }}
      >
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
