import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Quiz } from '@quiz/shared';
import { createGame } from '../api';
import { demoQuiz } from '../demo-quiz';
import { errorText, t } from '../i18n';
import { parseQuizFile } from '../quiz-file';
import { saveHost } from '../storage';

export function NewGame() {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const parsed = parseQuizFile(await file.text());
    setQuiz(parsed);
    setError(parsed === null ? t('badQuizFile') : null);
  };

  const create = async () => {
    if (quiz === null) return;
    setBusy(true);
    const result = await createGame(quiz);
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
    navigate(`/host/${result.code}`);
  };

  return (
    <main className="app narrow">
      <h1 className="brand">{t('newGameTitle')}</h1>
      <section className="panel">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuiz(demoQuiz);
            setError(null);
          }}
        >
          {t('demoQuiz')}
        </button>
        <label className="field">
          <span>{t('uploadQuiz')}</span>
          <input type="file" accept="application/json,.json" onChange={upload} aria-describedby="upload-hint" />
        </label>
        <p className="meta" id="upload-hint">
          {t('uploadHint')}
        </p>
        {quiz !== null && <p className="lead">{t('quizReady', { title: quiz.title, count: quiz.questions.length })}</p>}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-primary" disabled={quiz === null || busy} onClick={create}>
          {t(busy ? 'creating' : 'createGame')}
        </button>
      </section>
    </main>
  );
}
