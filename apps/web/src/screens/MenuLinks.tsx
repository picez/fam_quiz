import { t } from '../i18n';

/** Посилання після кінця гри: player — «До меню»; host — «До вікторин» і «Історія ігор»; stage — «До меню» в куті. */
export function MenuLinks({ role }: { role: 'player' | 'host' | 'stage' }) {
  // Звичайні <a href>: повне перезавантаження сторінки закриває сокет гри.
  if (role === 'stage') {
    return (
      <a className="btn btn-small stage-menu" href="/">
        {t('toMenu')}
      </a>
    );
  }
  return (
    <nav className="menu-links">
      {role === 'player' ? (
        <a className="btn" href="/">
          {t('toMenu')}
        </a>
      ) : (
        <>
          <a className="btn" href="/quizzes">
            {t('toQuizzesMenu')}
          </a>
          <a className="btn" href="/history">
            {t('toHistory')}
          </a>
        </>
      )}
    </nav>
  );
}
