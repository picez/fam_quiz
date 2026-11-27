import { NavLink } from 'react-router-dom';
import { HISTORY_TAB_PATH, type HistoryTab } from '../history-landing';
import { t, type TextKey } from '../i18n';
import { saveHistoryTab } from '../storage';

const TABS: { tab: HistoryTab; label: TextKey }[] = [
  { tab: 'hosted', label: 'historyTabHosted' },
  { tab: 'played', label: 'historyTabPlayed' },
  { tab: 'challenges', label: 'historyTabChallenges' },
];

/** Перемикач «Історії»: проведені ігри, зіграні й виклики (79); вибрана вкладка запам'ятовується на цьому пристрої. */
export function HistoryTabs() {
  return (
    <nav className="history-tabs" aria-label={t('menuHistory')}>
      {TABS.map(({ tab, label }) => (
        <NavLink key={tab} to={HISTORY_TAB_PATH[tab]} end onClick={() => saveHistoryTab(tab)}>
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );
}
