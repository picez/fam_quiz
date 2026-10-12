import { LIMITS, type Question, type Quiz } from '@quiz/shared';
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { cleaned, firstProblemIndex, newQuestion, problemsOf } from './draft';
import { QuestionEditor } from './QuestionEditor';

interface Props {
  initial: Quiz;
  heading: string;
  /** Повідомлення над формою, наприклад про відновлену чернетку. */
  notice?: string | null;
  /** Викликається після кожної зміни, щоб чернетку можна було зберегти про запас. */
  onDraft?: (quiz: Quiz) => void;
  /** Зберігає вікторину; повертає текст помилки або null. */
  onSave: (quiz: Quiz) => Promise<string | null>;
  onCancel: () => void;
}

export function QuizEditor({ initial, heading, notice = null, onDraft, onSave, onCancel }: Props) {
  const [quiz, setQuiz] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [openIndex, setOpenIndex] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { questions, settings } = quiz;

  // Закриття вкладки чи перезавантаження з незбереженими змінами: браузер перепитає.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: Quiz) => {
    setQuiz(next);
    setDirty(true);
    setProblems([]);
    onDraft?.(next);
  };
  const setQuestions = (next: Question[]) => update({ ...quiz, questions: next });
  const setSettings = (patch: Partial<Quiz['settings']>) => update({ ...quiz, settings: { ...settings, ...patch } });

  const move = (index: number, step: -1 | 1) => {
    const next = [...questions];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    setQuestions(next);
    if (openIndex === index) setOpenIndex(index + step);
    else if (openIndex === index + step) setOpenIndex(index);
  };

  const remove = (index: number) => {
    const hasText = questions[index].text.trim() !== '';
    if (hasText && !window.confirm(t('removeQuestionConfirm', { index: index + 1 }))) return;
    setQuestions(questions.filter((_, i) => i !== index));
    setOpenIndex(Math.max(0, openIndex > index || openIndex === questions.length - 1 ? openIndex - 1 : openIndex));
  };

  const add = () => {
    setQuestions([...questions, newQuestion('single')]);
    setOpenIndex(questions.length);
  };

  const cancel = () => {
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    onCancel();
  };

  const save = async () => {
    const found = problemsOf(quiz);
    setProblems(found);
    if (found.length > 0) {
      // Розгорнути запитання, яке треба виправити: воно може бути далеко за межами екрана.
      const broken = firstProblemIndex(quiz);
      if (broken !== null) setOpenIndex(broken);
      return;
    }
    setSaving(true);
    const error = await onSave(cleaned(quiz));
    setSaving(false);
    if (error === null) setDirty(false);
    else setProblems([error]);
  };

  return (
    <main className="app editor">
      <h1 className="brand">{heading}</h1>

      {notice !== null && (
        <p className="banner" role="status">
          {notice}
        </p>
      )}

      <section className="panel">
        <label className="field">
          <span>{t('quizTitle')}</span>
          <input value={quiz.title} maxLength={120} onChange={(event) => update({ ...quiz, title: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('quizDescription')}</span>
          <input
            value={quiz.description}
            maxLength={500}
            onChange={(event) => update({ ...quiz, description: event.target.value })}
          />
        </label>
      </section>

      <section className="panel">
        <h2>{t('settingsTitle')}</h2>
        <label className="check">
          <input type="checkbox" checked={settings.speedBonus} onChange={(event) => setSettings({ speedBonus: event.target.checked })} />
          <span>{t('speedBonus')}</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.shuffleOptions}
            onChange={(event) => setSettings({ shuffleOptions: event.target.checked })}
          />
          <span>{t('shuffleOptions')}</span>
        </label>
        <label className="field">
          <span>{t('leaderboardLabel')}</span>
          <select
            value={settings.leaderboard}
            onChange={(event) => setSettings({ leaderboard: event.target.value === 'end' ? 'end' : 'each' })}
          >
            <option value="each">{t('leaderboardEach')}</option>
            <option value="end">{t('leaderboardEnd')}</option>
          </select>
        </label>
      </section>

      {questions.map((question, index) => (
        <section className={index === openIndex ? 'panel qcard is-open' : 'panel qcard'} key={question.id}>
          <div className="qcard-head">
            <button
              type="button"
              className="qcard-title"
              aria-expanded={index === openIndex}
              onClick={() => setOpenIndex(index)}
            >
              <span className="letter">{t('questionN', { index: index + 1 })}</span>
              <span className="qcard-text">{question.text.trim() === '' ? t('untitled') : question.text}</span>
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveQuestionUp', { index: index + 1 })}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveQuestionDown', { index: index + 1 })}
              disabled={index === questions.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('removeQuestion', { index: index + 1 })}
              disabled={questions.length === 1}
              onClick={() => remove(index)}
            >
              ×
            </button>
          </div>
          {index === openIndex && (
            <QuestionEditor
              question={question}
              onChange={(next) => setQuestions(questions.map((q, i) => (i === index ? next : q)))}
            />
          )}
        </section>
      ))}

      <button type="button" className="btn" disabled={questions.length >= LIMITS.maxQuestions} onClick={add}>
        {t('addQuestion')}
      </button>

      {/* Повідомлення живуть у закріпленій панелі: їх видно, хоч би де була прокрутка. */}
      <footer className="actions">
        {problems.length > 0 && (
          <ul className="error problems" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn" onClick={cancel}>
          {t('cancel')}
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {t(saving ? 'saving' : 'save')}
        </button>
      </footer>
    </main>
  );
}
