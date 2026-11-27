import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { EasyModeSwitch } from '../EasyModeSwitch';
import { t } from '../i18n';
import { ProblemLink } from '../problems/ProblemLink';
import { ThemeSwitch } from '../ThemeSwitch';

/**
 * Низ головної (78), і гостю, і акаунту: довідка, «Легкий режим», тема, «Повідомити про проблему».
 * Дві довідки поряд (80): «Як грати» для гравця (/help/play) і «Довідка ведучого» (/help).
 */
export function HomeFooter(): JSX.Element {
  return (
    <section className="home-footer" aria-label={t('homeFooterLabel')}>
      <p className="home-footer-help">
        <Link className="quiet-link" to="/help/play">
          {t('playHelpTitle')}
        </Link>
        <Link className="quiet-link" to="/help">
          {t('helpLink')}
        </Link>
      </p>
      <EasyModeSwitch />
      <ThemeSwitch />
      {/* Скаргу (64) може надіслати й гість. */}
      <ProblemLink className="quiet-link problem-link" />
    </section>
  );
}
