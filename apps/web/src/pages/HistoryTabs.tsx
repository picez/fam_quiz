import { NavLink } from 'react-router-dom';
import { t } from '../i18n';

/** Перемикач між іграми, які людина провела, і тими, у які зіграла. */
export function HistoryTabs() {
  return (
    <nav className="history-tabs" aria-label={t('menuHistory')}>
      <NavLink to="/history" end>
        {t('historyTabHosted')}
      </NavLink>
      <NavLink to="/me" end>
        {t('historyTabPlayed')}
      </NavLink>
    </nav>
  );
}
