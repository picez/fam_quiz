import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { listGames, listQuizzes, myHistory } from '../api';
import { isNewAccount } from '../home-welcome';
import { t } from '../i18n';
import { loadWelcomeDone, saveWelcomeDone } from '../storage';

const TITLE = 'welcome-title';

/** Список або null при збої (і при відмові запиту). */
const listOrNull = <T,>(request: () => Promise<{ ok: true; data: T[] } | { ok: false }>): Promise<T[] | null> =>
  request().then((result) => (result.ok ? result.data : null), () => null);

/**
 * «З чого почати» (78): одноразова картка для зовсім нового акаунта (isNewAccount). «Зрозуміло» ховає її
 * для цього акаунта на цьому пристрої; закриту картку більше не перевіряємо — жодного запиту.
 */
export function WelcomeCard({ accountId }: { accountId: string }): JSX.Element | null {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(false);
    if (loadWelcomeDone(accountId)) return;
    let current = true;
    void Promise.all([listOrNull(listQuizzes), listOrNull(listGames), listOrNull(myHistory)]).then(([quizzes, hosted, played]) => {
      if (current) setShow(isNewAccount(quizzes, hosted, played));
    });
    return () => {
      current = false;
    };
  }, [accountId]);

  if (!show) return null;

  const done = () => {
    saveWelcomeDone(accountId);
    setShow(false);
  };

  return (
    <section className="panel welcome-card" aria-labelledby={TITLE}>
      <h2 id={TITLE}>{t('welcomeTitle')}</h2>
      <ol className="welcome-steps">
        <li>{t('welcomeJoin')}</li>
        <li>
          {t('welcomeLibrary')} <Link to="/library">{t('libraryTitle')}</Link>
        </li>
        <li>
          {t('welcomeCreate')} <Link to="/quizzes/new">{t('newQuiz')}</Link>
        </li>
      </ol>
      <button type="button" className="btn" onClick={done}>
        {t('welcomeDone')}
      </button>
    </section>
  );
}
