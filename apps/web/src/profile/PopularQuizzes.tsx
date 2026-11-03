import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n';

/** Скільки вікторин видно одразу; решта — за кнопкою «Ще N». */
export const PROFILE_TOP_QUIZZES = 3;

/** «Мої вікторини» в профілі: сервер віддає найзіграніші першими, тут — перші три й «Ще N», як у смузі досягнень. */
export function PopularQuizzes({ quizzes }: { quizzes: { id: string; title: string }[] }) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  // Кнопка «Ще N» зникає після натискання: фокус переходить на першу з відкритих вікторин, а не губиться на body.
  useEffect(() => {
    if (all) list.current?.querySelectorAll('a')[PROFILE_TOP_QUIZZES]?.focus();
  }, [all]);
  if (quizzes.length === 0) return <p className="meta">{t('noQuizzesYet')}</p>;
  const shown = all ? quizzes : quizzes.slice(0, PROFILE_TOP_QUIZZES);
  const rest = quizzes.length - shown.length;
  return (
    <>
      <ul className="profile-list" id="profile-quizzes" ref={list}>
        {shown.map((quiz) => (
          <li key={quiz.id}>
            <Link to={`/quizzes/${quiz.id}`}>
              <bdi>{quiz.title}</bdi>{' '}
              <span className="flip-rtl" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="achievement-strip-more">
          <button type="button" className="link-more" aria-controls="profile-quizzes" onClick={() => setAll(true)}>
            {t('profileQuizzesMore', { count: rest })}
          </button>
        </p>
      )}
    </>
  );
}
