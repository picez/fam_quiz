import { NavLink } from 'react-router-dom';
import { t } from '../i18n';

/** Вкладки сторінки «Вікторини» (77): Мої · Бібліотека · Вподобані — справжні адреси, як вкладки «Історії». */
export function QuizzesTabs() {
  return (
    <nav className="history-tabs" aria-label={t('menuQuizzes')}>
      <NavLink to="/quizzes" end>
        {t('quizzesTabMine')}
      </NavLink>
      <NavLink to="/library" end>
        {t('libraryTitle')}
      </NavLink>
      <NavLink to="/quizzes/liked" end>
        {t('quizzesTabLiked')}
      </NavLink>
    </nav>
  );
}
