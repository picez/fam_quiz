import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { EasyModeSwitch } from '../EasyModeSwitch';
import { t } from '../i18n';
import { ProblemLink } from '../problems/ProblemLink';
import { ThemeSwitch } from '../ThemeSwitch';

/**
 * Низ головної (78), і гостю, і акаунту: довідка, «Легкий режим», тема, «Повідомити про проблему».
 * /help — довідка лише про проведення гри, тож і назва «Довідка ведучого»; «Як грати» для гравця додасть етап 5.
 */
export function HomeFooter(): JSX.Element {
  return (
    <section className="home-footer" aria-label={t('homeFooterLabel')}>
      <Link className="quiet-link" to="/help">
        {t('helpLink')}
      </Link>
      <EasyModeSwitch />
      <ThemeSwitch />
      {/* Скаргу (64) може надіслати й гість. */}
      <ProblemLink className="quiet-link problem-link" />
    </section>
  );
}
