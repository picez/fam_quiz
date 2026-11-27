import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { AppearanceControls } from '../appearance/AppearanceControls';
import { t } from '../i18n';
import { ProblemLink } from '../problems/ProblemLink';

/**
 * Низ головної (78), і гостю, і акаунту: довідки, «Вигляд сайту» (легкий режим і тема), «Повідомити про проблему».
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
      {/* 80: «Вигляд сайту» — легкий режим одним дотиком і тема; той самий блок, що й у поповері меню компʼютера. */}
      <section className="home-looks" aria-labelledby="home-looks-title">
        <h2 id="home-looks-title">{t('siteLooksTitle')}</h2>
        <AppearanceControls />
      </section>
      {/* Скаргу (64) може надіслати й гість. */}
      <ProblemLink className="quiet-link problem-link" />
    </section>
  );
}
