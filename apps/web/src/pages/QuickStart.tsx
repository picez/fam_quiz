import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { listQuizzes, type QuizSummary } from '../api';
import { useStartGame } from '../host-game';
import { errorText, t } from '../i18n';

/** Скільки вікторин у «Швидкому запуску». */
export const QUICK_START_COUNT = 3;
const TITLE = 'quick-start-title';

/** Три вікторини з найпізнішою зміною (updatedAt), найсвіжіша перша. */
export function recentQuizzes(quizzes: QuizSummary[], count = QUICK_START_COUNT): QuizSummary[] {
  return [...quizzes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, count);
}

/**
 * «Швидкий запуск» (78): мої останні змінені вікторини з «Провести» — гра стартує одразу, як з картки вікторини.
 * Немає вікторин чи збій запиту — блоку немає (головна не кричить помилкою про другорядне).
 */
export function QuickStart(): JSX.Element | null {
  const startGame = useStartGame();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void listQuizzes().then(
      (result) => {
        if (current && result.ok) setQuizzes(recentQuizzes(result.data));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);

  if (quizzes === null || quizzes.length === 0) return null;

  const host = async (id: string) => {
    setBusy(id);
    setError(null);
    const failure = await startGame(id);
    // Успіх уже переніс на пульт; лишаємось тут лише з помилкою.
    if (failure !== null) {
      setBusy(null);
      setError(errorText(failure));
    }
  };

  return (
    <section className="panel quick-start" aria-labelledby={TITLE}>
      <div className="profile-section-head">
        <h2 id={TITLE}>{t('homeQuickTitle')}</h2>
        <Link className="quiet-link" to="/quizzes">
          {t('homeQuickAll')}
        </Link>
      </div>
      <ul className="quick-list">
        {quizzes.map((quiz) => (
          <li key={quiz.id}>
            <span className="quick-name" dir="auto">
              {quiz.title}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              aria-label={t('homeQuickHost', { title: quiz.title })}
              disabled={busy !== null}
              onClick={() => void host(quiz.id)}
            >
              {t('play')}
            </button>
          </li>
        ))}
      </ul>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
