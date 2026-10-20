import { LIMITS, questionsOf, roundQuestions, type Question, type Quiz, type Round } from '@quiz/shared';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import {
  cleaned,
  duplicateQuestion,
  firstProblem,
  moveItem,
  newBlitzRound,
  newBoardRound,
  newClassicRound,
  newQuestion,
  problemsOf,
} from './draft';
import { BoardEditor } from './BoardEditor';
import { QuestionEditor } from './QuestionEditor';
import { RoundSettings } from './RoundSettings';
import { RoundStrip } from './RoundStrip';

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

/**
 * Редактор «список і сцена»: ліворуч назва, правила й усі запитання, праворуч одне запитання
 * таким, яким його побачать гравці. На вузькому екрані список ховається за кнопку.
 */
export function QuizEditor({ initial, heading, notice = null, onDraft, onSave, onCancel }: Props) {
  const [quiz, setQuiz] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Клітинка поля, яку треба показати після невдалого збереження. */
  const [boardFocus, setBoardFocus] = useState<{ category: number; index: number } | null>(null);
  /** Запитання, яке зараз перетягують у списку. */
  const dragged = useRef<number | null>(null);
  const { rounds, settings } = quiz;
  const ri = Math.min(roundIndex, rounds.length - 1);
  const round = rounds[ri];
  // У полі плаского списку запитань немає: ним керує BoardEditor.
  const questions: Question[] = round.type === 'board' ? [] : round.questions;
  const current = questions[Math.min(selected, questions.length - 1)];
  const last = questions.length - 1;

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
  const setRounds = (next: Quiz['rounds']) => update({ ...quiz, rounds: next });
  const setRound = (next: Round) => setRounds(rounds.map((r, index) => (index === ri ? next : r)));
  const setQuestions = (next: Question[]) => {
    if (round.type !== 'board') setRound({ ...round, questions: next });
  };
  /** Запитань у всій вікторині: ліміт 200 діє на всі раунди разом. */
  const total = questionsOf(quiz).length;
  const roomForMore = questions.length < LIMITS.maxQuestions && total < LIMITS.maxQuizQuestions;
  const setSettings = (patch: Partial<Quiz['settings']>) => update({ ...quiz, settings: { ...settings, ...patch } });

  const select = (index: number) => {
    setSelected(index);
    setListOpen(false);
  };

  /** Переносить запитання на нове місце; виділення лишається на тому, що було вибране. */
  const move = (from: number, to: number) => {
    const next = moveItem(questions, from, to);
    if (next === questions) return;
    const picked = questions[selected];
    setQuestions(next);
    setSelected(next.indexOf(picked));
  };

  const remove = () => {
    const hasText = current.text.trim() !== '';
    if (hasText && !window.confirm(t('removeQuestionConfirm', { index: selected + 1 }))) return;
    setQuestions(questions.filter((_, index) => index !== selected));
    setSelected(Math.max(0, selected === last ? selected - 1 : selected));
  };

  const add = () => {
    setQuestions([...questions, newQuestion('single')]);
    select(questions.length);
  };

  const duplicate = () => {
    const next = [...questions];
    next.splice(selected + 1, 0, duplicateQuestion(current));
    setQuestions(next);
    select(selected + 1);
  };

  const selectRound = (index: number) => {
    setRoundIndex(index);
    setSelected(0);
    setBoardFocus(null);
    setListOpen(false);
  };

  const addRound = (type: Round['type']) => {
    setRounds([...rounds, type === 'blitz' ? newBlitzRound() : type === 'board' ? newBoardRound() : newClassicRound()]);
    selectRound(rounds.length);
  };

  const renameRound = (index: number) => {
    const title = window.prompt(t('roundNamePrompt', { index: index + 1 }), rounds[index].title);
    if (title === null) return;
    setRounds(rounds.map((r, i) => (i === index ? { ...r, title: title.slice(0, LIMITS.roundTitle) } : r)));
  };

  /** Переносить раунд; вибраним лишається той самий раунд. */
  const moveRound = (from: number, to: number) => {
    const next = moveItem(rounds, from, to);
    if (next === rounds) return;
    setRounds(next);
    setRoundIndex(next.indexOf(rounds[ri]));
  };

  const removeRound = (index: number) => {
    if (rounds.length === 1) return;
    const target = rounds[index];
    const targetQuestions = roundQuestions(target);
    const hasText = targetQuestions.some((q) => q.text.trim() !== '');
    if (hasText && !window.confirm(t('removeRoundConfirm', { index: index + 1, count: targetQuestions.length }))) return;
    setRounds(rounds.filter((_, i) => i !== index));
    selectRound(Math.max(0, index === rounds.length - 1 ? index - 1 : index));
  };

  const cancel = () => {
    if (dirty && !window.confirm(t('discardConfirm'))) return;
    onCancel();
  };

  const save = async () => {
    const found = problemsOf(quiz);
    setProblems(found);
    if (found.length > 0) {
      // Показати запитання, яке треба виправити: воно може бути далеко у списку.
      const broken = firstProblem(quiz);
      if (broken !== null) {
        setRoundIndex(broken.round);
        setSelected(broken.question);
        setBoardFocus(broken.cell === null ? null : { ...broken.cell });
      }
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

      <RoundStrip
        rounds={rounds}
        selected={ri}
        onSelect={selectRound}
        onAdd={addRound}
        onRename={renameRound}
        onMove={moveRound}
        onRemove={removeRound}
      />
      <RoundSettings round={round} index={ri + 1} onChange={setRound} />

      <div className="editor-grid">
        <aside className="editor-side">
          <label className="field">
            <span>{t('quizTitle')}</span>
            <input value={quiz.title} maxLength={120} onChange={(event) => update({ ...quiz, title: event.target.value })} />
          </label>

          <details className="rules">
            <summary>{t('settingsTitle')}</summary>
            <label className="field">
              <span>{t('quizDescription')}</span>
              <input
                value={quiz.description}
                maxLength={500}
                onChange={(event) => update({ ...quiz, description: event.target.value })}
              />
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
          </details>

          {round.type !== 'board' && (
            <>
              {/* На вузькому екрані список схований; ці кнопки гортають запитання й відкривають його. */}
              <div className="question-nav">
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={t('prevQuestion')}
                  disabled={selected === 0}
                  onClick={() => select(selected - 1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="btn question-nav-all"
                  aria-label={t('allQuestions')}
                  aria-expanded={listOpen}
                  onClick={() => setListOpen(!listOpen)}
                >
                  {`${selected + 1} / ${questions.length}`}
                  <span aria-hidden="true"> ☰</span>
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={t('nextQuestion')}
                  disabled={selected === last}
                  onClick={() => select(selected + 1)}
                >
                  ›
                </button>
              </div>

              <ol className={listOpen ? 'question-list is-open' : 'question-list'}>
                {questions.map((question, index) => {
                  const text = question.text.trim() === '' ? t('untitled') : question.text;
                  return (
                    <li
                      key={question.id}
                      className={index === selected ? 'is-on' : undefined}
                      draggable
                      onDragStart={() => {
                        dragged.current = index;
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragged.current !== null) move(dragged.current, index);
                        dragged.current = null;
                      }}
                    >
                      <button
                        type="button"
                        className="question-item"
                        aria-current={index === selected}
                        aria-label={`${t('questionN', { index: index + 1 })} ${text}`}
                        onClick={() => select(index)}
                      >
                        <span className="grip" aria-hidden="true">
                          ⋮⋮
                        </span>
                        <span className="letter">{index + 1}</span>
                        <span className="question-item-text">{text}</span>
                        <span className="question-item-type">{t(`typeShort_${question.type}`)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <button type="button" className="btn btn-dashed" disabled={!roomForMore} onClick={add}>
                {t('addQuestion')}
              </button>
            </>
          )}
        </aside>

        {round.type === 'board' ? (
          <section className="editor-stage">
            <BoardEditor
              key={round.id}
              round={round}
              focus={boardFocus}
              roomForMore={total < LIMITS.maxQuizQuestions}
              roomForCategory={total + LIMITS.minCategoryQuestions <= LIMITS.maxQuizQuestions}
              onChange={setRound}
            />
          </section>
        ) : (
          <section className="editor-stage" aria-label={t('questionN', { index: selected + 1 })}>
            <QuestionEditor
              key={current.id}
              question={current}
              onChange={(next) => setQuestions(questions.map((question, index) => (index === selected ? next : question)))}
            />
            <div className="toolbar">
              <button type="button" className="btn btn-small" disabled={!roomForMore} onClick={duplicate}>
                {t('duplicate')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={t('moveQuestionUp', { index: selected + 1 })}
                disabled={selected === 0}
                onClick={() => move(selected, selected - 1)}
              >
                {t('moveUpShort')}
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={t('moveQuestionDown', { index: selected + 1 })}
                disabled={selected === last}
                onClick={() => move(selected, selected + 1)}
              >
                {t('moveDownShort')}
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                aria-label={t('removeQuestion', { index: selected + 1 })}
                disabled={questions.length === 1}
                onClick={remove}
              >
                {t('remove')}
              </button>
            </div>
          </section>
        )}
      </div>

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
