import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { getGroups, listQuizzes, type QuizSummary } from '../api';
import { addDemoQuiz, useStartGame } from '../host-game';
import { quizSizeText } from '../format';
import { errorText, t } from '../i18n';
import { ProfileSubpage } from '../profile/ProfileSubpage';
import { useAccount } from '../useAccount';
import { Loading, LoadError } from '../ui/PageState';

const LOGIN = '/login?next=%2Fcreate';

/** «Створити гру» зі стартового меню: вікторини гравця, у кожної «Почати гру» — одразу кімната ведучого. */
export function CreateGame() {
  // 76: «Спробувати ще раз», коли не вдалося з'ясувати, хто на сторінці.
  const [accountTry, setAccountTry] = useState(0);
  const account = useAccount(accountTry === 0 ? undefined : accountTry);
  const startGame = useStartGame();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Збій самого списку (76): окремо від помилок дій, щоб замість вічного «Завантажуємо…» була помилка з повтором. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const signedIn = account.status === 'signed-in';
  // 79: «Провести гру для групи» — ?group=<id>; лише моя видима група, інакше параметр мовчки ігнорується.
  const [params] = useSearchParams();
  const groupId = params.get('group');
  const [forGroup, setForGroup] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    setForGroup(null);
    if (!signedIn || groupId === null) return;
    let alive = true;
    void getGroups().then((result) => {
      const found = result.ok ? result.groups.find((group) => group.id === groupId && group.hidden === undefined) : undefined;
      if (alive && found !== undefined) setForGroup({ id: found.id, name: found.name });
    });
    return () => {
      alive = false;
    };
  }, [signedIn, groupId]);

  const fail = useCallback((code: string) => {
    if (code === 'unauthorized') setExpired(true);
    else setError(errorText(code));
  }, []);

  const reload = useCallback(async () => {
    const result = await listQuizzes();
    if (result.ok) {
      setQuizzes(result.data);
      setLoadError(null);
    } else if (result.error === 'unauthorized') setExpired(true);
    else setLoadError(errorText(result.error));
  }, []);

  useEffect(() => {
    if (signedIn) void reload();
  }, [signedIn, reload]);

  // Гість — на вхід, як і на «Мої вікторини»; після входу повертаємось сюди.
  if (account.status === 'anonymous' || expired) return <Navigate to={LOGIN} replace />;
  if (account.status === 'unknown') {
    return (
      <main className="app narrow">
        <LoadError message={errorText(account.error)} onRetry={() => setAccountTry((n) => n + 1)} />
      </main>
    );
  }
  if (account.status === 'loading') {
    return (
      <main className="app narrow">
        <Loading />
      </main>
    );
  }

  const run = async (action: () => Promise<string | null>, after?: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    const failure = await action();
    if (failure !== null) fail(failure);
    else if (after !== undefined) await after();
    setBusy(false);
  };

  const newQuiz = (
    <Link className="btn btn-primary" to="/quizzes/new">
      <span aria-hidden="true">+{' '}</span>
      {t('newQuiz')}
    </Link>
  );

  return (
    <ProfileSubpage title={t('startCreate')} back="/" className="create-game">
      {forGroup !== null && <p className="meta create-for-group">{t('createForGroup', { group: forGroup.name })}</p>}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {quizzes === null && loadError === null && <Loading list />}
      {quizzes === null && loadError !== null && (
        <LoadError
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            void reload();
          }}
        />
      )}
      {quizzes !== null && loadError !== null && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {quizzes !== null && quizzes.length === 0 && (
        <>
          <p className="lead">{t('noQuizzes')}</p>
          <div className="toolbar">
            {newQuiz}
            <button type="button" className="btn" disabled={busy} onClick={() => void run(addDemoQuiz, reload)}>
              {t('addDemo')}
            </button>
          </div>
        </>
      )}
      {quizzes !== null && quizzes.length > 0 && (
        <>
          <ul className="quiz-list">
            {quizzes.map((quiz) => (
              <li className="panel" key={quiz.id}>
                <div>
                  <h2 dir="auto">{quiz.title}</h2>
                  <p className="meta">{quizSizeText(t('questionCount', { count: quiz.questionCount }), quiz.questionCount, quiz.truth)}</p>
                </div>
                <div className="toolbar">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => startGame(quiz.id, forGroup?.id))}>
                    {t('start')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="toolbar">{newQuiz}</div>
        </>
      )}
      {quizzes !== null && (
        <Link className="quiet-link" to="/quizzes">
          {t('createMoreHint')}
        </Link>
      )}
    </ProfileSubpage>
  );
}
